"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, PlugZap, Radio, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  connFingerprint,
  loadConn,
  loadFeishu,
  saveConn,
  saveFeishu,
  type FeishuSettings,
  type SpecflowConn,
} from "@/lib/specflow-storage";

type Preset = {
  id: string;
  name: string;
  base_url: string;
  default_model: string;
  docs?: string;
};

export function SettingsCenter() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [conn, setConn] = useState<SpecflowConn>(() => loadConn());
  const [feishu, setFeishu] = useState<FeishuSettings>(() => loadFeishu());
  const [testLoading, setTestLoading] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [feishuTest, setFeishuTest] = useState<string | null>(null);
  const [feishuBusy, setFeishuBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/providers")
      .then((r) => r.json())
      .then((d: { presets?: Preset[] }) => setPresets(d.presets ?? []))
      .catch(() => null);
  }, []);

  const persistConn = useCallback((next: Partial<SpecflowConn>) => {
    setConn((c) => {
      const merged = { ...c, ...next };
      saveConn(merged);
      return merged;
    });
  }, []);

  const selectPreset = (p: Preset) => {
    setConn((c) => {
      const merged: SpecflowConn = {
        ...c,
        providerId: p.id,
        baseUrl: p.base_url || c.baseUrl,
        modelId: p.default_model || c.modelId,
        verifiedFingerprint: null,
      };
      saveConn(merged);
      return merged;
    });
    setTestMsg(null);
    setModelOptions([]);
  };

  const runTest = async () => {
    setTestLoading(true);
    setTestMsg(null);
    try {
      if (!conn.baseUrl.trim()) {
        setTestMsg("请填写 Base URL（须含 /v1）。");
        return;
      }
      if (!conn.apiKey.trim()) {
        setTestMsg("请填写 API Key。");
        return;
      }
      const r = await fetch("/api/upstream/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: conn.baseUrl.trim(),
          api_key: conn.apiKey.trim(),
          model: conn.modelId.trim() || null,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; checked_with?: string };
      if (j.ok) {
        const fp = connFingerprint(conn.baseUrl, conn.apiKey, conn.modelId);
        persistConn({ verifiedFingerprint: fp });
        setTestMsg(`通过（${j.checked_with ?? "ok"}）。已解锁 Pilot 与模型拉取。`);
        void fetchModels(conn.baseUrl, conn.apiKey);
      } else {
        persistConn({ verifiedFingerprint: null });
        setTestMsg(j.error ?? "探测失败");
      }
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : String(e));
      persistConn({ verifiedFingerprint: null });
    } finally {
      setTestLoading(false);
    }
  };

  const fetchModels = async (baseOverride?: string, keyOverride?: string) => {
    setModelsLoading(true);
    setModelOptions([]);
    try {
      const b = (baseOverride ?? conn.baseUrl).trim();
      const k = (keyOverride ?? conn.apiKey).trim();
      const headers: Record<string, string> = {};
      if (k) headers.Authorization = `Bearer ${k}`;
      if (b) headers["X-SpecFlow-Base-Url"] = b;
      const r = await fetch("/v1/models", { headers });
      const raw = await r.text();
      if (!r.ok) {
        setTestMsg((m) => (m ? `${m}\n` : "") + `模型列表 HTTP ${r.status}: ${raw.slice(0, 200)}`);
        return;
      }
      const j = JSON.parse(raw) as { data?: { id?: string }[] };
      const ids = (j.data ?? []).map((x) => x.id).filter(Boolean) as string[];
      setModelOptions(ids.slice(0, 200));
    } catch (e) {
      setTestMsg((m) => (m ? `${m}\n` : "") + `拉取模型失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setModelsLoading(false);
    }
  };

  const verified =
    conn.skipConnectionVerify ||
    (conn.verifiedFingerprint === connFingerprint(conn.baseUrl, conn.apiKey, conn.modelId) &&
      conn.baseUrl.trim().length > 0);

  const testFeishu = async () => {
    setFeishuBusy(true);
    setFeishuTest(null);
    try {
      const r = await fetch("/api/feishu-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: feishu.webhookUrl.trim(),
          text: "SpecFlow：飞书 Webhook 测试",
        }),
      });
      const j = (await r.json()) as { ok?: boolean; status?: number; error?: string; body?: string };
      if (j.ok) setFeishuTest(`已发送，上游 HTTP ${j.status ?? "?"}`);
      else setFeishuTest(j.error ?? `失败 ${JSON.stringify(j)}`);
    } catch (e) {
      setFeishuTest(e instanceof Error ? e.message : String(e));
    } finally {
      setFeishuBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">配置中心</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          参考「配置型代理」交互：先选供应商卡片，再测通连接，最后从上游拉取模型列表或手填模型 ID。配置保存在本机{" "}
          <code className="text-emerald-400/90">localStorage</code>，刷新保留。
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <PlugZap className="h-4 w-4 text-emerald-400" aria-hidden />
          供应商与连接
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => {
            const active = conn.providerId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all hover:border-zinc-600",
                  active
                    ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30"
                    : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
                  {active ? <Check className="h-4 w-4 text-emerald-400" aria-hidden /> : null}
                </div>
                {p.base_url ? (
                  <p className="mt-2 truncate font-mono text-[11px] text-zinc-500">{p.base_url}</p>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">自定义 Base URL</p>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-zinc-500">
            Base URL（须含 /v1）
            <input
              value={conn.baseUrl}
              onChange={(e) => persistConn({ baseUrl: e.target.value, verifiedFingerprint: null })}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-500">
            API Key
            <input
              type="password"
              value={conn.apiKey}
              onChange={(e) => persistConn({ apiKey: e.target.value, verifiedFingerprint: null })}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-600"
              autoComplete="off"
            />
          </label>
          <div className="sm:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1 text-xs font-medium text-zinc-500">
                模型（探测通过后可从列表选择）
                <div className="mt-1.5 flex gap-2">
                  <input
                    list="specflow-model-options"
                    value={conn.modelId}
                    onChange={(e) => persistConn({ modelId: e.target.value, verifiedFingerprint: null })}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-600"
                  />
                  <datalist id="specflow-model-options">
                    {modelOptions.map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => void fetchModels()}
                    disabled={modelsLoading || !conn.apiKey.trim()}
                    className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {modelsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "刷新模型"}
                  </button>
                </div>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                测试连接
              </button>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={conn.skipConnectionVerify}
                  onChange={(e) => persistConn({ skipConnectionVerify: e.target.checked })}
                />
                跳过连接测试（仅本机开发）
              </label>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  verified ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"
                )}
              >
                {verified ? "已验证" : "未验证"}
              </span>
            </div>
            {testMsg ? (
              <p
                className={cn(
                  "mt-3 text-sm",
                  testMsg.includes("通过") ? "text-emerald-400/90" : "text-amber-200/90"
                )}
              >
                {testMsg}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Webhook className="h-4 w-4 text-violet-400" aria-hidden />
          告警与飞书 Webhook
        </h2>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
          <label className="block text-xs font-medium text-zinc-500">
            Webhook URL
            <input
              value={feishu.webhookUrl}
              onChange={(e) => {
                const v = e.target.value;
                setFeishu((f) => ({ ...f, webhookUrl: v }));
                saveFeishu({ webhookUrl: v });
              }}
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={feishu.alertHighLatency}
                onChange={(e) => {
                  const v = e.target.checked;
                  setFeishu((f) => ({ ...f, alertHighLatency: v }));
                  saveFeishu({ alertHighLatency: v });
                }}
              />
              高延迟告警
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={feishu.alertFailover}
                onChange={(e) => {
                  const v = e.target.checked;
                  setFeishu((f) => ({ ...f, alertFailover: v }));
                  saveFeishu({ alertFailover: v });
                }}
              />
              Failover 切换告警
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void testFeishu()}
              disabled={feishuBusy || !feishu.webhookUrl.trim().startsWith("https://")}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
            >
              {feishuBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              测试飞书 Webhook
            </button>
            <span className="text-xs text-zinc-500">由 Next Route 代发，需 feishu.cn / larksuite.com 域名</span>
          </div>
          {feishuTest ? <p className="text-sm text-zinc-400">{feishuTest}</p> : null}
          <p className="text-xs leading-relaxed text-zinc-600">
            开关状态已写入 localStorage；与网关策略联动需在 server 增加配置 API（后续迭代）。
          </p>
        </div>
      </section>
    </div>
  );
}
