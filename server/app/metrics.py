from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


@dataclass
class RequestMetric:
    ts: float
    latency_ms: float
    cache_hit: bool
    mode: str
    intent: str
    target_model: str
    draft_model: Optional[str]
    prompt_tokens: int
    completion_tokens: int
    upstream_index: int
    speculative_saved_second_call: bool


class MetricsHub:
    """In-memory metrics + WebSocket fan-out."""

    def __init__(self, history_max: int = 200) -> None:
        self._lock = asyncio.Lock()
        self._started_at = time.time()
        self._history: deque[RequestMetric] = deque(maxlen=history_max)
        self._clients: set[WebSocket] = set()
        self._totals = {
            "requests": 0,
            "cache_hits": 0,
            "tokens_prompt": 0,
            "tokens_completion": 0,
            "latency_ms_sum": 0.0,
            "cost_usd_estimate": 0.0,
            "speculative_skipped_target": 0,
        }

    async def record(self, m: RequestMetric, cost_delta: float) -> None:
        async with self._lock:
            self._history.appendleft(m)
            self._totals["requests"] += 1
            if m.cache_hit:
                self._totals["cache_hits"] += 1
            self._totals["tokens_prompt"] += m.prompt_tokens
            self._totals["tokens_completion"] += m.completion_tokens
            self._totals["latency_ms_sum"] += m.latency_ms
            self._totals["cost_usd_estimate"] += cost_delta
            if m.speculative_saved_second_call:
                self._totals["speculative_skipped_target"] += 1
            payload = self.snapshot()
        await self._broadcast(payload)

    def _derived(self) -> dict[str, Any]:
        """由累计量与最近样本推导的展示指标（进程内近似）。"""
        lat_sum = self._totals["latency_ms_sum"]
        tok = self._totals["tokens_prompt"] + self._totals["tokens_completion"]
        throughput: float | None = None
        if lat_sum > 0:
            throughput = round(tok / (lat_sum / 1000.0), 1)
        recent = list(self._history)
        std_lats = [m.latency_ms for m in recent if not m.cache_hit and m.mode == "standard"]
        spec_lats = [m.latency_ms for m in recent if not m.cache_hit and m.mode == "speculative"]
        lat_red: float | None = None
        if len(std_lats) >= 2 and len(spec_lats) >= 2:
            av_s = sum(std_lats) / len(std_lats)
            av_p = sum(spec_lats) / len(spec_lats)
            if av_s > 0:
                lat_red = round((av_s - av_p) / av_s * 100, 1)
        return {
            "throughput_tok_per_s": throughput,
            "latency_reduction_pct": lat_red,
        }

    def snapshot(self) -> dict[str, Any]:
        reqs = self._totals["requests"]
        avg_lat = (self._totals["latency_ms_sum"] / reqs) if reqs else 0.0
        hit_rate = (self._totals["cache_hits"] / reqs) if reqs else 0.0
        return {
            "version": "0.3.0",
            "uptime_s": round(time.time() - self._started_at, 1),
            "totals": dict(self._totals),
            "avg_latency_ms": round(avg_lat, 2),
            "cache_hit_rate": round(hit_rate, 4),
            "derived": self._derived(),
            "recent": [self._metric_to_dict(x) for x in list(self._history)[:50]],
        }

    @staticmethod
    def _metric_to_dict(m: RequestMetric) -> dict[str, Any]:
        return {
            "ts": m.ts,
            "latency_ms": round(m.latency_ms, 2),
            "cache_hit": m.cache_hit,
            "mode": m.mode,
            "intent": m.intent,
            "target_model": m.target_model,
            "draft_model": m.draft_model,
            "prompt_tokens": m.prompt_tokens,
            "completion_tokens": m.completion_tokens,
            "upstream_index": m.upstream_index,
            "speculative_saved_second_call": m.speculative_saved_second_call,
        }

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)
        try:
            await ws.send_json(self.snapshot())
            while True:
                try:
                    await asyncio.wait_for(ws.receive(), timeout=120.0)
                except asyncio.TimeoutError:
                    await ws.send_json({"type": "ping", "ts": time.time()})
        except WebSocketDisconnect:
            pass
        finally:
            self._clients.discard(ws)

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in self._clients:
            try:
                await ws.send_json({"type": "metrics", **payload})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)


hub = MetricsHub()
