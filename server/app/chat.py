from __future__ import annotations

import time
from copy import deepcopy
from typing import Any, Optional

import httpx

from app.compress import compress_messages
from app.config import InferenceMode, get_settings
from app.intent import TaskIntent, classify_intent, last_user_message
from app.metrics import RequestMetric, hub
from app.pilot import pair_for_intent
from app.semantic_cache import get_semantic_cache
from app.upstream import FailoverClient, resolve_endpoints


def _estimate_cost(
    *,
    prompt_tokens: int,
    completion_tokens: int,
    used_draft: bool,
    used_target: bool,
) -> float:
    s = get_settings()
    cost = 0.0
    if used_draft:
        cost += (prompt_tokens / 1_000_000) * s.price_draft_input_per_mtok
        cost += (completion_tokens / 1_000_000) * s.price_draft_output_per_mtok
    if used_target and not used_draft:
        cost += (prompt_tokens / 1_000_000) * s.price_target_input_per_mtok
        cost += (completion_tokens / 1_000_000) * s.price_target_output_per_mtok
    if used_target and used_draft:
        # Rough: draft pass + target pass (split completion tokens 50/50 for estimate)
        d_pt, t_pt = prompt_tokens, prompt_tokens
        d_ct = completion_tokens // 2
        t_ct = completion_tokens - d_ct
        cost += (d_pt / 1_000_000) * s.price_draft_input_per_mtok
        cost += (d_ct / 1_000_000) * s.price_draft_output_per_mtok
        cost += (t_pt / 1_000_000) * s.price_target_input_per_mtok
        cost += (t_ct / 1_000_000) * s.price_target_output_per_mtok
    return round(cost, 6)


def _strip_specflow_extensions(payload: dict[str, Any]) -> dict[str, Any]:
    p = deepcopy(payload)
    p.pop("specflow_mode", None)
    p.pop("specflow_skip_cache", None)
    return p


async def orchestrate_chat_completion(
    body: dict[str, Any],
    *,
    mode_header: Optional[str],
    client: httpx.AsyncClient,
    client_api_key: Optional[str] = None,
    request_base_url: Optional[str] = None,
) -> dict[str, Any]:
    settings = get_settings()
    failover = FailoverClient(settings)
    cache = get_semantic_cache()

    raw_mode = (mode_header or body.get("specflow_mode") or "standard").lower()
    mode: InferenceMode = "speculative" if raw_mode == "speculative" else "standard"
    skip_cache = bool(body.get("specflow_skip_cache"))

    inner = _strip_specflow_extensions(body)
    messages = inner.get("messages") or []
    if not isinstance(messages, list):
        messages = []
    messages = compress_messages(messages)  # type: ignore[arg-type]
    inner["messages"] = messages

    user_text = last_user_message(messages)
    intent = classify_intent(user_text)
    pair = pair_for_intent(intent, settings)

    body_model = inner.get("model")
    if isinstance(body_model, str) and body_model.strip():
        target_model = body_model.strip()
        draft_model = body_model.strip()
    else:
        target_model = pair.target
        draft_model = pair.draft

    cache_model = target_model
    emb_base = (request_base_url or "").strip() or None
    if not skip_cache:
        eps = resolve_endpoints(
            settings,
            override_base_urls=request_base_url,
            override_api_key=client_api_key,
        )
        key0 = (client_api_key or "").strip() or (eps[0].api_key if eps else "")
        hit = await cache.lookup(
            user_text=user_text,
            model=cache_model,
            mode=mode,
            api_key=key0 or None,
            client=client,
            embedding_base_url=emb_base,
        )
        if hit is not None:
            t0 = time.perf_counter()
            metric = RequestMetric(
                ts=time.time(),
                latency_ms=(time.perf_counter() - t0) * 1000,
                cache_hit=True,
                mode=mode,
                intent=intent.value,
                target_model=target_model,
                draft_model=draft_model,
                prompt_tokens=0,
                completion_tokens=0,
                upstream_index=-1,
                speculative_saved_second_call=False,
            )
            await hub.record(metric, 0.0)
            return hit

    t_start = time.perf_counter()
    used_draft = False
    used_target = False
    speculative_saved = False
    upstream_index = 0

    # Streaming not implemented in MVP; reject stream=True for clarity
    if inner.get("stream") is True:
        inner["stream"] = False

    if mode == "standard":
        inner_std = deepcopy(inner)
        inner_std["model"] = target_model
        r, upstream_index = await failover.post_chat(
            client,
            inner_std,
            override_api_key=client_api_key,
            override_base_urls=request_base_url,
        )
        data = r.json()
        used_target = True
    else:
        # API-orchestrated speculative path: draft → optional target
        inner_draft = deepcopy(inner)
        inner_draft["model"] = draft_model
        mt = inner_draft.get("max_tokens")
        if isinstance(mt, int):
            inner_draft["max_tokens"] = min(mt, 512)
        else:
            inner_draft["max_tokens"] = 512
        r_d, upstream_index = await failover.post_chat(
            client,
            inner_draft,
            override_api_key=client_api_key,
            override_base_urls=request_base_url,
        )
        draft_data = r_d.json()
        used_draft = True

        choice0 = (draft_data.get("choices") or [{}])[0]
        msg = (choice0.get("message") or {}).get("content") or ""
        msg_l = msg.lower()
        simple_ok = (
            intent == TaskIntent.GENERAL
            and len(msg) < 900
            and "i cannot" not in msg_l
            and "can't assist" not in msg_l
        )
        if simple_ok:
            data = draft_data
            speculative_saved = True
        else:
            inner_tgt = deepcopy(inner)
            inner_tgt["model"] = target_model
            r_t, upstream_index = await failover.post_chat(
                client,
                inner_tgt,
                override_api_key=client_api_key,
                override_base_urls=request_base_url,
            )
            data = r_t.json()
            used_target = True

    usage = data.get("usage") or {}
    pt = int(usage.get("prompt_tokens") or 0)
    ct = int(usage.get("completion_tokens") or 0)
    latency_ms = (time.perf_counter() - t_start) * 1000

    cost = _estimate_cost(
        prompt_tokens=pt,
        completion_tokens=ct,
        used_draft=used_draft,
        used_target=used_target,
    )

    metric = RequestMetric(
        ts=time.time(),
        latency_ms=latency_ms,
        cache_hit=False,
        mode=mode,
        intent=intent.value,
        target_model=target_model,
        draft_model=draft_model,
        prompt_tokens=pt,
        completion_tokens=ct,
        upstream_index=upstream_index,
        speculative_saved_second_call=speculative_saved,
    )
    await hub.record(metric, cost)

    if not skip_cache:
        eps = resolve_endpoints(
            settings,
            override_base_urls=request_base_url,
            override_api_key=client_api_key,
        )
        key0 = (client_api_key or "").strip() or (eps[0].api_key if eps else "")
        await cache.store(
            user_text=user_text,
            model=cache_model,
            mode=mode,
            response=data,
            api_key=key0 or None,
            client=client,
            embedding_base_url=emb_base,
        )

    return data
