from __future__ import annotations

import hashlib
import re
import time
from collections import OrderedDict
from typing import Any, Optional

import httpx
import numpy as np

from app.config import Settings, get_settings


def _normalize(text: str) -> str:
    t = text.strip().lower()
    t = re.sub(r"\s+", " ", t)
    return t[:8000]


def _hash_key(text: str) -> str:
    return hashlib.sha256(_normalize(text).encode("utf-8")).hexdigest()


class SemanticCache:
    """
    Hybrid exact + optional embedding similarity cache.
    Without OPENAI key: exact key on normalized last user turn + model + mode.
    With key: store embedding vectors, evict LRU.
    """

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._exact: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._emb_keys: list[str] = []
        self._emb_vecs: list[np.ndarray] = []
        self._emb_meta: dict[str, tuple[float, dict[str, Any]]] = {}

    def _exact_cache_key(self, normalized: str, model: str, mode: str) -> str:
        return hashlib.sha256(f"{model}|{mode}|{normalized}".encode()).hexdigest()

    async def lookup(
        self,
        *,
        user_text: str,
        model: str,
        mode: str,
        api_key: Optional[str],
        client: httpx.AsyncClient,
        embedding_base_url: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        norm = _normalize(user_text)
        ek = self._exact_cache_key(norm, model, mode)
        if ek in self._exact:
            self._exact.move_to_end(ek)
            _, payload = self._exact[ek]
            return payload

        if not api_key:
            return None

        vec = await self._embed(user_text, api_key, client, embedding_base_url=embedding_base_url)
        if vec is None:
            return None

        k = _hash_key(user_text + "|" + model + "|" + mode)
        th = self.settings.semantic_similarity_threshold
        best_sim = -1.0
        best_key: Optional[str] = None
        for i, ek2 in enumerate(self._emb_keys):
            sim = float(np.dot(vec, self._emb_vecs[i]))
            if sim > best_sim:
                best_sim = sim
                best_key = ek2
        if best_key is not None and best_sim >= th:
            ts, payload = self._emb_meta[best_key]
            return payload
        return None

    async def store(
        self,
        *,
        user_text: str,
        model: str,
        mode: str,
        response: dict[str, Any],
        api_key: Optional[str],
        client: httpx.AsyncClient,
        embedding_base_url: Optional[str] = None,
    ) -> None:
        norm = _normalize(user_text)
        ek = self._exact_cache_key(norm, model, mode)
        now = time.time()
        self._exact[ek] = (now, response)
        self._exact.move_to_end(ek)
        while len(self._exact) > self.settings.semantic_cache_max_entries:
            self._exact.popitem(last=False)

        if not api_key:
            return

        vec = await self._embed(user_text, api_key, client, embedding_base_url=embedding_base_url)
        if vec is None:
            return

        k = _hash_key(user_text + "|" + model + "|" + mode)
        if k in self._emb_meta:
            return
        vnorm = vec / (np.linalg.norm(vec) + 1e-9)
        self._emb_keys.append(k)
        self._emb_vecs.append(vnorm)
        self._emb_meta[k] = (now, response)
        max_e = self.settings.semantic_cache_max_entries
        while len(self._emb_keys) > max_e:
            old = self._emb_keys.pop(0)
            self._emb_vecs.pop(0)
            self._emb_meta.pop(old, None)

    async def _embed(
        self,
        text: str,
        api_key: str,
        client: httpx.AsyncClient,
        *,
        embedding_base_url: Optional[str] = None,
    ) -> Optional[np.ndarray]:
        s = self.settings
        url = None
        raw_bases = (embedding_base_url or "").strip() or s.upstream_urls
        for u in raw_bases.split(","):
            u = u.strip().rstrip("/")
            if u:
                url = f"{u}/embeddings"
                break
        if not url:
            return None
        try:
            r = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": s.embedding_model, "input": _normalize(text)[:8000]},
                timeout=30.0,
            )
            r.raise_for_status()
            data = r.json()
            vec = np.array(data["data"][0]["embedding"], dtype=np.float64)
            n = np.linalg.norm(vec)
            return vec / (n + 1e-9) if n > 0 else vec
        except Exception:
            return None


_cache_singleton: Optional[SemanticCache] = None


def get_semantic_cache() -> SemanticCache:
    global _cache_singleton
    if _cache_singleton is None:
        _cache_singleton = SemanticCache()
    return _cache_singleton
