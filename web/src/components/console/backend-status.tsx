"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function BackendStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = (await r.json()) as { ok?: boolean; latency_ms?: number };
        if (!cancelled) {
          setOk(!!j.ok);
          setMs(typeof j.latency_ms === "number" ? j.latency_ms : null);
        }
      } catch {
        if (!cancelled) {
          setOk(false);
          setMs(null);
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
        ok === null && "border-zinc-700 bg-zinc-900 text-zinc-500",
        ok === true && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        ok === false && "border-red-500/30 bg-red-500/10 text-red-300"
      )}
      title="对聚合网关 /healthz 的探测"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {ok === null ? "网关检测中…" : ok ? `网关在线${ms != null ? ` · ${ms}ms` : ""}` : "网关不可达"}
    </span>
  );
}
