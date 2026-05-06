from __future__ import annotations

import contextlib
import json
from typing import Any, Optional

import httpx
from fastapi import FastAPI, Header, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.chat import orchestrate_chat_completion
from app.config import get_settings
from app.metrics import hub
from app.providers import list_presets
from app.upstream import resolve_endpoints
from app.upstream_test import probe_upstream


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()
    yield
    await app.state.http.aclose()


app = FastAPI(title="SpecFlow", version="0.1.0", lifespan=lifespan)
_settings = get_settings()
_origins = [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/metrics")
async def api_metrics() -> dict[str, Any]:
    return hub.snapshot()


@app.get("/api/providers")
async def api_providers() -> dict[str, Any]:
    return {"presets": list_presets()}


class UpstreamTestBody(BaseModel):
    base_url: str = Field(..., description="OpenAI 兼容基址，须含 /v1")
    api_key: str
    model: Optional[str] = Field(
        default=None,
        description="当 GET /models 不可用时用于 chat 极简探测的模型 ID",
    )


@app.post("/api/upstream/test")
async def api_upstream_test(request: Request, body: UpstreamTestBody) -> dict[str, Any]:
    client: httpx.AsyncClient = request.app.state.http
    return await probe_upstream(
        client,
        base_url=body.base_url,
        api_key=body.api_key,
        model=body.model,
    )


@app.get("/v1/models")
async def proxy_list_models(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_specflow_base_url: Optional[str] = Header(default=None, alias="X-SpecFlow-Base-Url"),
) -> Response:
    """透传上游 OpenAI 兼容 GET /v1/models，供控制台填充模型下拉。"""
    client: httpx.AsyncClient = request.app.state.http
    bearer: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip() or None
    base = (x_specflow_base_url or "").strip() or None
    eps = resolve_endpoints(
        get_settings(),
        override_base_urls=base,
        override_api_key=bearer,
    )
    if not eps:
        return Response(content='{"error":"no upstream"}', status_code=502, media_type="application/json")
    ep = eps[0]
    url = f"{ep.base_url}/models"
    headers: dict[str, str] = {}
    key = (bearer or "").strip() or ep.api_key
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        r = await client.get(url, headers=headers, timeout=45.0)
        ct = r.headers.get("content-type", "application/json")
        return Response(content=r.content, status_code=r.status_code, media_type=ct)
    except Exception as e:
        return Response(
            content=json.dumps({"error": str(e)}),
            status_code=502,
            media_type="application/json",
        )


@app.websocket("/ws/metrics")
async def ws_metrics(ws: WebSocket) -> None:
    await hub.connect(ws)


@app.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_specflow_mode: Optional[str] = Header(default=None, alias="X-SpecFlow-Mode"),
    x_specflow_base_url: Optional[str] = Header(default=None, alias="X-SpecFlow-Base-Url"),
) -> dict[str, Any]:
    body = await request.json()
    client: httpx.AsyncClient = request.app.state.http
    bearer: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip() or None
    base_url = (x_specflow_base_url or "").strip() or None
    return await orchestrate_chat_completion(
        body,
        mode_header=x_specflow_mode,
        client=client,
        client_api_key=bearer,
        request_base_url=base_url,
    )
