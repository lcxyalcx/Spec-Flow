from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx

from app.config import Settings, get_settings


@dataclass
class UpstreamEndpoint:
    base_url: str
    api_key: str


def parse_upstreams(settings: Optional[Settings] = None) -> list[UpstreamEndpoint]:
    s = settings or get_settings()
    urls = [u.strip().rstrip("/") for u in s.upstream_urls.split(",") if u.strip()]
    keys_raw = [k.strip() for k in s.upstream_api_keys.split(",") if k.strip()]
    if not urls:
        urls = ["https://api.openai.com/v1"]
    if not keys_raw:
        keys_raw = [""]
    if len(keys_raw) == 1 and len(urls) > 1:
        keys = keys_raw * len(urls)
    else:
        keys = keys_raw
        while len(keys) < len(urls):
            keys.append(keys[-1] if keys else "")
    return [UpstreamEndpoint(base_url=u, api_key=k) for u, k in zip(urls, keys)]


def resolve_endpoints(
    settings: Optional[Settings] = None,
    *,
    override_base_urls: Optional[str] = None,
    override_api_key: Optional[str] = None,
) -> list[UpstreamEndpoint]:
    """
    若请求携带 X-SpecFlow-Base-Url（可逗号多机），则仅使用该列表 + 请求内 API Key；
    否则使用环境变量 UPSTREAM_URLS / UPSTREAM_API_KEYS。
    """
    s = settings or get_settings()
    raw = (override_base_urls or "").strip()
    if raw:
        urls = [u.strip().rstrip("/") for u in raw.split(",") if u.strip()]
        key = (override_api_key or "").strip()
        return [UpstreamEndpoint(base_url=u, api_key=key) for u in urls]
    return parse_upstreams(s)


class FailoverClient:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._rr = 0

    def _next_order(self, n: int) -> list[int]:
        if n == 0:
            return [0]
        start = self._rr % n
        self._rr += 1
        return [((start + i) % n) for i in range(n)]

    async def post_chat(
        self,
        client: httpx.AsyncClient,
        payload: dict,
        *,
        override_api_key: Optional[str] = None,
        override_base_urls: Optional[str] = None,
    ) -> tuple[httpx.Response, int]:
        endpoints = resolve_endpoints(
            self.settings,
            override_base_urls=override_base_urls,
            override_api_key=override_api_key,
        )
        if not endpoints:
            raise RuntimeError("No upstream endpoints configured")
        last_err: Optional[BaseException] = None
        for idx in self._next_order(len(endpoints)):
            ep = endpoints[idx]
            url = f"{ep.base_url}/chat/completions"
            headers = {"Content-Type": "application/json"}
            key = (override_api_key or "").strip() or ep.api_key
            if key:
                headers["Authorization"] = f"Bearer {key}"
            try:
                r = await client.post(url, json=payload, headers=headers, timeout=120.0)
                if r.status_code in (401, 403, 400):
                    r.raise_for_status()
                if r.status_code >= 500 or r.status_code == 429:
                    last_err = RuntimeError(f"upstream {r.status_code} at {url}")
                    continue
                r.raise_for_status()
                return r, idx
            except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError) as e:
                last_err = e
                continue
        if last_err is not None:
            raise last_err
        raise RuntimeError("No upstream response")
