# SpecFlow

**SpecFlow** 是一套可自托管的 **LLM 推理编排与成本优化** 产品：OpenAI 兼容的 **`/v1/chat/completions`** 网关 + **Next.js 控制台**。内置 **Pilot 意图路由**、**语义缓存**、**上下文压缩**、**上游 Failover**、**API 级投机编排**（草稿试探 → 按任务决定是否调用目标模型），并把编排结果沉淀为 **可运营指标**（吞吐、命中率、节支估算等）。

> 硬件级投机解码需同卡 logits；当前为 **多模型 API 编排**，适合纯云端 API 与混合部署。

---

## 产品能力清单（v0.3）

| 模块 | 说明 |
|------|------|
| **聚合网关** | FastAPI；`POST /v1/chat/completions`；头 `X-SpecFlow-Mode`、`X-SpecFlow-Base-Url`；`GET /v1/models` 透传。 |
| **多供应商** | 硅基流动等 OpenAI 兼容基址；`POST /api/upstream/test` 探测。 |
| **控制台 · 总览** | 实时 KPI（吞吐/延迟降幅样本/命中率/节支）、WebSocket 或轮询、`/api/health` 顶栏探活；无流量时空状态引导。 |
| **控制台 · Pilot** | 标准 vs 投机双栏、模拟流式、tok/s 与延迟对比。 |
| **控制台 · 可观测性** | 最近请求表 + 示意瀑布图。 |
| **控制台 · 配置** | 供应商卡片、连接测试、模型列表、飞书 Webhook 测试（Next 代发）。 |
| **Docker** | `docker compose up --build` 同时起网关 :8000 与控制台 :3000。 |

---

## 仓库结构

```
spec-flow/
├── server/          # FastAPI 网关
├── web/             # Next.js 14 App Router 控制台
├── docker-compose.yml
├── .env.example     # 网关环境变量示例
└── README.md
```

---

## 本地部署（推荐）

### 1. 网关

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd .. && cp .env.example .env   # 编辑 UPSTREAM_* 等
cd server && source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

健康检查：<http://127.0.0.1:8000/healthz>

### 2. 控制台

```bash
cd web
npm install
npm run dev
```

浏览器：<http://localhost:3000>（根路径跳转 `/overview`）。

**转发说明**：`web/src/middleware.ts` 将 `/api/*`、`/v1/*` 代理到网关，默认 **`http://127.0.0.1:8000`**。若网关在其他地址：

- 开发：在 `web/.env.local` 中设置 `SPECFLOW_API_INTERNAL` 或 `NEXT_PUBLIC_SPECFLOW_API_ORIGIN`。
- WebSocket 总览：默认 `ws://当前主机:8000/ws/metrics`，可用 `NEXT_PUBLIC_SPECFLOW_WS_ORIGIN` 覆盖（见 `web/.env.example`）。

**本机 Next API**（不转发）：`/api/health`、`/api/feishu-test`。

### 3. Docker 全栈

```bash
cp .env.example .env   # 配置上游 KEY 等
docker compose up --build
```

- 控制台：<http://localhost:3000>
- 网关：<http://localhost:8000>

`specflow-web` 构建参数内已写入 `SPECFLOW_API_INTERNAL=http://specflow-api:8000`；浏览器侧 WS 构建为 `ws://localhost:8000`（需将网关 **8000** 映射到宿主机）。

---

## 网关 API 摘要

| 端点 | 作用 |
|------|------|
| `POST /v1/chat/completions` | OpenAI 兼容聊天；`X-SpecFlow-Mode: standard \| speculative` |
| `GET /v1/models` | 透传模型列表 |
| `GET /api/metrics` | 进程内指标快照（含 `derived` 派生字段） |
| `GET /api/providers` | 供应商预设 |
| `POST /api/upstream/test` | 连接探测 |
| `WS /ws/metrics` | 指标推送 |

---

## 环境变量（网关）

见根目录 `.env.example`（`UPSTREAM_URLS`、`UPSTREAM_API_KEYS`、`DEFAULT_*_MODEL`、硅基流动示例等）。

---

## 路线图

- [ ] `stream=true` 全链路流式
- [ ] Pilot 外置 YAML / 多租户
- [ ] Redis / pgvector 缓存
- [ ] Prometheus、OpenTelemetry

---

## License

MIT
