"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { MetricsRecentRow } from "@/lib/metrics-types";
import { cn } from "@/lib/utils";

export type TraceRow = MetricsRecentRow;

type MetricsPayload = {
  totals: Record<string, number>;
  avg_latency_ms: number;
  cache_hit_rate: number;
  recent: TraceRow[];
};

function waterfallPhases(row: TraceRow): { label: string; pct: number; className: string }[] {
  if (row.cache_hit) {
    return [
      { label: "Intent 路由", pct: 0.08, className: "bg-sky-500/90" },
      { label: "语义 / 精确缓存命中", pct: 0.85, className: "bg-emerald-500/90" },
      { label: "计量与回包", pct: 0.07, className: "bg-zinc-500/80" },
    ];
  }
  if (row.mode === "speculative") {
    if (row.speculative_saved_second_call) {
      return [
        { label: "Intent 路由", pct: 0.1, className: "bg-sky-500/90" },
        { label: "缓存未命中", pct: 0.05, className: "bg-zinc-600/90" },
        { label: "草稿模型生成", pct: 0.7, className: "bg-amber-500/90" },
        { label: "跳过目标核验", pct: 0.15, className: "bg-emerald-600/90" },
      ];
    }
    return [
      { label: "Intent 路由", pct: 0.08, className: "bg-sky-500/90" },
      { label: "缓存查找", pct: 0.07, className: "bg-zinc-600/90" },
      { label: "草稿模型", pct: 0.42, className: "bg-amber-500/90" },
      { label: "目标模型核验", pct: 0.33, className: "bg-violet-500/90" },
      { label: "TTFT / 收尾", pct: 0.1, className: "bg-zinc-500/80" },
    ];
  }
  return [
    { label: "Intent 路由", pct: 0.1, className: "bg-sky-500/90" },
    { label: "缓存查找", pct: 0.12, className: "bg-zinc-600/90" },
    { label: "目标模型推理", pct: 0.68, className: "bg-blue-500/90" },
    { label: "计量与回包", pct: 0.1, className: "bg-zinc-500/80" },
  ];
}

export function TracesView() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceRow | null>(null);

  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/metrics", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as MetricsPayload;
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void pull();
    const id = setInterval(() => void pull(), 4000);
    return () => clearInterval(id);
  }, [pull]);

  const rows = data?.recent ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">可观测性</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          聚合网关进程内指标（<code className="text-emerald-400/90">/api/metrics</code>
          ），每 4 秒刷新。点击行查看<strong className="text-zinc-300">示意性瀑布图</strong>
          （阶段占比由延迟与模式推导，非分布式 trace id）。
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          无法拉取指标：{err}（请确认后端已启动且 Next rewrites 指向正确地址）
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <div className="border-b border-zinc-800 px-4 py-3 text-xs text-zinc-500">
          最近 {rows.length} 条 · 平均延迟 {data ? `${data.avg_latency_ms.toFixed(0)} ms` : "—"} · 缓存命中率{" "}
          {data ? `${(data.cache_hit_rate * 100).toFixed(1)}%` : "—"}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">时间</th>
                <th className="px-4 py-2.5 font-medium">模式</th>
                <th className="px-4 py-2.5 font-medium">意图</th>
                <th className="px-4 py-2.5 font-medium">延迟</th>
                <th className="px-4 py-2.5 font-medium">缓存</th>
                <th className="px-4 py-2.5 font-medium">Tokens</th>
                <th className="px-4 py-2.5 font-medium">上游</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.ts}-${i}`}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b border-zinc-800/80 transition-colors hover:bg-zinc-800/40"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-500">
                    {new Date(r.ts * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-200">{r.mode}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{r.intent}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{r.latency_ms.toFixed(0)} ms</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-medium",
                        r.cache_hit ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
                      )}
                    >
                      {r.cache_hit ? "HIT" : "MISS"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                    {r.prompt_tokens}/{r.completion_tokens}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{r.upstream_index}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                    暂无请求记录。去 Pilot 试跑或 curl 调用网关后即可在此看到数据。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Trace 示意</div>
                <div className="text-sm font-semibold text-zinc-100">请求瀑布</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <dt className="text-zinc-500">模式</dt>
                <dd className="text-right text-zinc-200">{selected.mode}</dd>
                <dt className="text-zinc-500">意图</dt>
                <dd className="text-right text-zinc-200">{selected.intent}</dd>
                <dt className="text-zinc-500">总延迟</dt>
                <dd className="text-right font-mono text-zinc-200">{selected.latency_ms.toFixed(1)} ms</dd>
                <dt className="text-zinc-500">模型</dt>
                <dd className="text-right text-zinc-300">{selected.target_model}</dd>
              </dl>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  阶段耗时（示意）
                </div>
                <div className="space-y-2">
                  {waterfallPhases(selected).map((ph) => {
                    const ms = selected.latency_ms * ph.pct;
                    return (
                      <div key={ph.label}>
                        <div className="mb-1 flex justify-between text-xs text-zinc-400">
                          <span>{ph.label}</span>
                          <span className="font-mono text-zinc-300">{ms.toFixed(1)} ms</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={cn("h-full rounded-full transition-all", ph.className)}
                            style={{ width: `${ph.pct * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-zinc-600">
                此为产品化示意视图，便于解释 SpecFlow 管线。生产环境可替换为 OpenTelemetry / Tempo 与真实 span。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
