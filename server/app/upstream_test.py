from __future__ import annotations

import time
from typing import Any, Optional

import httpx


def _norm_base(base_url: str) -> str:
    return base_url.strip().rstrip("/")


async def probe_upstream(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    api_key: str,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    验证 OpenAI 兼容上游是否可用：
    1) 优先 GET {base}/models
    2) 失败则使用 POST {base}/chat/completions 极简探测（需提供 model）
    """
    base = _norm_base(base_url)
    if not base:
        return {"ok": False, "error": "base_url 为空"}
    key = api_key.strip()
    if not key:
        return {"ok": False, "error": "api_key 为空"}

    headers = {"Authorization": f"Bearer {key}"}

    t0 = time.perf_counter()
    try:
        r = await client.get(f"{base}/models", headers=headers, timeout=20.0)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        if r.status_code == 200:
            try:
                data = r.json()
                models = data.get("data") if isinstance(data, dict) else None
                n = len(models) if isinstance(models, list) else 0
            except Exception:
                n = 0
            return {
                "ok": True,
                "checked_with": "GET /models",
                "base_url": base,
                "latency_ms": round(elapsed_ms, 2),
                "models_count": n,
            }
        err_text = r.text[:500] if r.text else ""
        if r.status_code in (401, 403):
            return {
                "ok": False,
                "error": f"鉴权失败 ({r.status_code})，请检查 API Key 是否属于该 base_url",
                "detail": err_text,
            }
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        return {"ok": False, "error": f"连接失败: {e!s}"}

    if not (model and model.strip()):
        return {
            "ok": False,
            "error": "无法列出模型且未提供 model：请填写用于探测的模型 ID（硅基流动需在模型广场复制全名）",
        }

    t1 = time.perf_counter()
    try:
        r2 = await client.post(
            f"{base}/chat/completions",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "model": model.strip(),
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            },
            timeout=45.0,
        )
        elapsed_ms = (time.perf_counter() - t1) * 1000
        if r2.status_code == 200:
            return {
                "ok": True,
                "checked_with": "POST /chat/completions",
                "base_url": base,
                "latency_ms": round(elapsed_ms, 2),
                "model": model.strip(),
            }
        err_text = r2.text[:800] if r2.text else ""
        return {
            "ok": False,
            "error": f"chat 探测失败 HTTP {r2.status_code}",
            "detail": err_text,
        }
    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError) as e:
        return {"ok": False, "error": f"chat 探测异常: {e!s}"}
