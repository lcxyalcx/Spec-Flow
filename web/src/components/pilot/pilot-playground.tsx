"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, Loader2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { isConnVerified, loadConn, type SpecflowConn } from "@/lib/specflow-storage";

type PaneState = {
  output: string;
  streaming: boolean;
  loading: boolean;
  error: string;
  latencyMs: number | null;
  tokPerS: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

const initialPane: PaneState = {
  output: "",
  streaming: false,
  loading: false,
  error: "",
  latencyMs: null,
  tokPerS: null,
  promptTokens: null,
  completionTokens: null,
};

function useStreamWriter() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const streamText = useCallback(
    (full: string, onUpdate: (s: string) => void, onDone: () => void) => {
      cancel();
      let i = 0;
      const chunk = Math.max(2, Math.ceil(full.length / 80));
      timerRef.current = setInterval(() => {
        i += chunk;
        if (i >= full.length) {
          onUpdate(full);
          cancel();
          onDone();
        } else {
          onUpdate(full.slice(0, i));
        }
      }, 18);
    },
    [cancel]
  );

  useEffect(() => () => cancel(), [cancel]);

  return { streamText, cancel };
}

async function runChat(
  mode: "standard" | "speculative",
  prompt: string,
  conn: SpecflowConn
): Promise<{
  text: string;
  latencyMs: number;
  pt: number;
  ct: number;
  raw: string;
}> {
  const t0 = performance.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SpecFlow-Mode": mode,
  };
  if (conn.apiKey.trim()) headers.Authorization = `Bearer ${conn.apiKey.trim()}`;
  if (conn.baseUrl.trim()) headers["X-SpecFlow-Base-Url"] = conn.baseUrl.trim();

  const r = await fetch("/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: conn.modelId.trim() || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    }),
  });
  const latencyMs = performance.now() - t0;
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(raw.slice(0, 600) || `HTTP ${r.status}`);
  }
  const json = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const pt = json.usage?.prompt_tokens ?? 0;
  const ct = json.usage?.completion_tokens ?? 0;
  return { text, latencyMs, pt, ct, raw };
}

export function PilotPlayground() {
  const [conn, setConn] = useState<SpecflowConn>(() => loadConn());
  const [prompt, setPrompt] = useState(
    "用约 80 字说明语义缓存如何降低重复请求的算力成本。"
  );
  const [standard, setStandard] = useState<PaneState>(initialPane);
  const [speculative, setSpeculative] = useState<PaneState>(initialPane);
  const stdStream = useStreamWriter();
  const specStream = useStreamWriter();

  useEffect(() => {
    const refresh = () => setConn(loadConn());
    window.addEventListener("storage", refresh);
    window.addEventListener("specflow-config", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("specflow-config", refresh);
    };
  }, []);

  const verified = isConnVerified(conn);

  const execPane = useCallback(
    async (mode: "standard" | "speculative", setPane: Dispatch<SetStateAction<PaneState>>) => {
      if (!prompt.trim()) {
        setPane((p) => ({ ...p, error: "请输入提示词。" }));
        return;
      }
      if (!verified) {
        setPane((p) => ({ ...p, error: "请先在配置中心通过连接测试，或勾选跳过验证。" }));
        return;
      }
      const stream = mode === "standard" ? stdStream : specStream;
      stream.cancel();
      setPane({
        ...initialPane,
        loading: true,
        streaming: false,
        error: "",
      });
      try {
        const res = await runChat(mode, prompt, conn);
        const totalTok = res.pt + res.ct;
        const tokPerS = totalTok > 0 && res.latencyMs > 0 ? totalTok / (res.latencyMs / 1000) : null;
        setPane((p) => ({
          ...p,
          loading: false,
          streaming: true,
          output: "",
          latencyMs: Math.round(res.latencyMs),
          tokPerS: tokPerS !== null ? Math.round(tokPerS * 10) / 10 : null,
          promptTokens: res.pt,
          completionTokens: res.ct,
        }));
        stream.streamText(
          res.text,
          (partial) => setPane((p) => ({ ...p, output: partial })),
          () => setPane((p) => ({ ...p, streaming: false }))
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPane({
          ...initialPane,
          loading: false,
          error: msg,
        });
      }
    },
    [conn, prompt, specStream, stdStream, verified]
  );

  const runStandard = useCallback(() => void execPane("standard", setStandard), [execPane]);
  const runSpeculative = useCallback(() => void execPane("speculative", setSpeculative), [execPane]);
  const runBoth = useCallback(() => {
    void runStandard();
    void runSpeculative();
  }, [runSpeculative, runStandard]);

  const Pane = ({
    title,
    subtitle,
    icon: Icon,
    tone,
    state,
    onRun,
  }: {
    title: string;
    subtitle: string;
    icon: typeof Zap;
    tone: "slate" | "emerald";
    state: PaneState;
    onRun: () => void;
  }) => (
    <div
      className={cn(
        "flex min-h-[420px] flex-col rounded-2xl border bg-zinc-900/50 p-4 shadow-sm ring-1 ring-zinc-800/90",
        tone === "emerald" ? "border-emerald-500/25 ring-emerald-500/10" : "border-zinc-800"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              tone === "emerald"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-zinc-800 text-zinc-300"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <p className="text-xs leading-relaxed text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={state.loading || !verified}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            tone === "emerald"
              ? "bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
              : "bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-40"
          )}
        >
          {state.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          运行
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span className="rounded-md border border-zinc-700/80 bg-zinc-950/80 px-2 py-0.5 font-mono">
          {state.latencyMs != null ? `${state.latencyMs} ms` : "— 端到端"}
        </span>
        <span className="rounded-md border border-zinc-700/80 bg-zinc-950/80 px-2 py-0.5 font-mono">
          {state.tokPerS != null ? `${state.tokPerS} tok/s` : "— 吞吐"}
        </span>
        {state.promptTokens != null ? (
          <span className="rounded-md border border-zinc-700/80 bg-zinc-950/80 px-2 py-0.5 font-mono">
            in/out {state.promptTokens}/{state.completionTokens ?? 0}
          </span>
        ) : null}
      </div>
      <div className="mt-3 min-h-[220px] flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[13px] leading-relaxed text-zinc-200">
        {state.error ? (
          <span className="text-red-400">{state.error}</span>
        ) : state.output ? (
          state.output
        ) : state.loading ? (
          <span className="text-zinc-500">正在请求上游…</span>
        ) : (
          <span className="text-zinc-600">输出将在此模拟流式呈现（基于完整响应分片刷新）。</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Pilot 试跑</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            左侧标准推理，右侧 Pilot 投机编排。共享提示词，可分别运行或一键对比；输出区使用<strong className="text-zinc-300">前端模拟流式</strong>
            以突出差异（网关仍为非 stream JSON）。
          </p>
        </div>
        <button
          type="button"
          onClick={runBoth}
          disabled={!verified || standard.loading || speculative.loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4 text-amber-300" aria-hidden />
          一键对比两侧
        </button>
      </div>

      {!verified ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          尚未通过连接验证（当前指纹与配置中心不一致）。请前往{" "}
          <Link href="/settings" className="font-semibold text-amber-300 underline-offset-2 hover:underline">
            配置中心
          </Link>{" "}
          完成探测；或在配置里勾选「跳过连接测试」。
        </div>
      ) : null}

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">共享提示词</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-600"
          placeholder="输入要对比的任务…"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Pane
          title="标准推理"
          subtitle="单路径调用目标模型（Pilot 仍会做意图分类，但走标准上游）。"
          icon={Zap}
          tone="slate"
          state={standard}
          onRun={runStandard}
        />
        <Pane
          title="SpecFlow Pilot · 投机编排"
          subtitle="草稿优先；简单任务可跳过目标模型二次调用，降低时延与成本。"
          icon={Sparkles}
          tone="emerald"
          state={speculative}
          onRun={runSpeculative}
        />
      </div>

      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        指标为浏览器侧测得的端到端耗时与 usage 估算 tok/s，便于 A/B 目视对比。
      </p>
    </div>
  );
}
