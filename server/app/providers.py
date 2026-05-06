from __future__ import annotations

from typing import Any

# OpenAI 兼容网关；base_url 须含 /v1 前缀（与多数供应商文档一致）
PROVIDER_PRESETS: list[dict[str, Any]] = [
    {
        "id": "openai",
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "docs": "https://platform.openai.com/docs/api-reference",
        "default_model": "gpt-4o-mini",
        "default_draft_model": "gpt-4o-mini",
        "embedding_model": "text-embedding-3-small",
    },
    {
        "id": "siliconflow",
        "name": "硅基流动 SiliconFlow",
        "base_url": "https://api.siliconflow.cn/v1",
        "docs": "https://docs.siliconflow.cn/",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
        "default_draft_model": "Qwen/Qwen2.5-7B-Instruct",
        "embedding_model": "BAAI/bge-m3",
    },
    {
        "id": "custom",
        "name": "自定义 OpenAI 兼容",
        "base_url": "",
        "docs": "",
        "default_model": "",
        "default_draft_model": "",
        "embedding_model": "",
    },
]


def list_presets() -> list[dict[str, Any]]:
    return PROVIDER_PRESETS
