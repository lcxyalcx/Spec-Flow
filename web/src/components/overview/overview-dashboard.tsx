"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeDelta, Card, Flex, Grid, LineChart, Metric, Text, Title } from "@tremor/react";
import { buildMockHourlySeries } from "@/lib/mock-overview";
import type { MetricsSnapshot } from "@/lib/metrics-types";

function wsMetricsUrl(): string {
  if (typeof window === "undefined") return "";
  const raw = process.env.NEXT_PUBLIC_SPECFLOW_WS_ORIGIN?.trim();
  if (raw) {
    const base = raw.replace(/\/$/, "");
    return base.endsWith("/ws/metrics") ? base : `${base}/ws/metrics`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:8000/ws/metrics`;
}

export function OverviewDashboard() {
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const applyPayload = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;
    const d = data as Record<string, unknown>;
    if ("totals" in d && "recent" in d) {
      setSnap(d as MetricsSnapshot);
      setErr(null);
    }
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/metrics", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        applyPayload(await r.json());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void poll();

    let ws: WebSocket | null = null;
    try {
      const url = wsMetricsUrl();
      if (url) {
        ws = new WebSocket(url);
        ws.onopen = () => setLive(true);
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data as string);
            if (data.type === "ping") return;
            if (data.type === "metrics") {
              const { type, ...rest } = data;
              void type;
              applyPayload(rest);
            } else {
              applyPayload(data);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onerror = () => {
          setLive(false);
          void poll();
        };
        ws.onclose = () => setLive(false);
      }
    } catch {
      setLive(false);
    }

    const id = setInterval(() => void poll(), 8000);
    return () => {
      clearInterval(id);
      ws?.close();
    };
  }, [applyPayload]);

  const chartFromRecent = useMemo(() => {
    const recent = snap?.recent ?? [];
    if (recent.length < 2) return null;
    const slice = [...recent].slice(0, 36).reverse();
    return slice.map((r, i) => ({
      idx: `#${i + 1}`,
      latency: r.latency_ms,
      tokens: r.prompt_tokens + r.completion_tokens,
    }));
  }, [snap]);

  const mockSeries = useMemo(
    () =>
      buildMockHourlySeries().map((h) => ({
        idx: h.hour,
        latency: h.avgLatencyMs,
        tokens: h.requests,
      })),
    []
  );

  const chartData = chartFromRecent ?? mockSeries;
  const usingMockSeries = !chartFromRecent;

  const totals = snap?.totals;
  const derived = snap?.derived;
  const requests = totals?.requests ?? 0;
  const hitPct = snap ? (snap.cache_hit_rate * 100).toFixed(1) : "—";
  const throughput = derived?.throughput_tok_per_s;
  const latRed = derived?.latency_reduction_pct;
  const cost = totals?.cost_usd_estimate ?? 0;
  const skipped = totals?.speculative_skipped_target ?? 0;
  const uptime = snap?.uptime_s;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">全局看板</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            KPI 与累计数据来自网关 <code className="text-emerald-400/90">/api/metrics</code>
            ；支持 WebSocket 推送（默认 <code className="text-zinc-500">ws://主机:8000/ws/metrics</code>
            ，可用 <code className="text-zinc-500">NEXT_PUBLIC_SPECFLOW_WS_ORIGIN</code> 覆盖）。下方折线在请求数较少时使用
            <strong className="text-zinc-300">演示时间序列</strong>占位。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-2.5 py-1 font-medium ${
              live
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-500"
            }`}
          >
            {live ? "WS 已连接" : "WS 轮询降级"}
          </span>
          {typeof uptime === "number" ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-400">
              进程 uptime {uptime}s
            </span>
          ) : null}
          {snap?.version ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-500">
              API {snap.version}
            </span>
          ) : null}
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          指标拉取异常：{err}。请确认聚合网关已启动；图表将使用演示数据。
        </div>
      ) : null}

      {requests === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-zinc-300">尚无网关请求样本</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            完成配置后前往 Pilot 发起几次标准 / 投机调用，即可在此看到真实吞吐、命中率与节支估算。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/settings"
              className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
            >
              配置中心
            </Link>
            <Link
              href="/pilot"
              className="rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-500"
            >
              Pilot 试跑
            </Link>
          </div>
        </div>
      ) : null}

      <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
        <Card className="ring-1 ring-zinc-800/80" decoration="top" decorationColor="blue">
          <Flex alignItems="start" justifyContent="between">
            <Text className="text-tremor-content dark:text-dark-tremor-content">吞吐（估算）</Text>
            {throughput != null && throughput > 0 ? (
              <BadgeDelta deltaType="moderateIncrease">有效 tok/s</BadgeDelta>
            ) : null}
          </Flex>
          <Metric className="mt-2">
            {throughput != null && throughput > 0 ? (
              <>
                {throughput.toLocaleString()} <span className="text-base font-medium">tok/s</span>
              </>
            ) : (
              "—"
            )}
          </Metric>
          <Text className="mt-2 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            累计 tokens ÷ 累计请求耗时（网关视角近似），含缓存命中与草稿短路。
          </Text>
        </Card>

        <Card className="ring-1 ring-zinc-800/80" decoration="top" decorationColor="amber">
          <Text>延迟降幅（Pilot 样本）</Text>
          <Metric className="mt-2">
            {latRed != null ? `${latRed}%` : "—"}
          </Metric>
          <Text className="mt-2 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            基于最近请求中「非缓存」standard vs speculative 平均延迟对比；样本不足时显示破折号。
          </Text>
        </Card>

        <Card className="ring-1 ring-zinc-800/80" decoration="top" decorationColor="violet">
          <Text>缓存命中率</Text>
          <Metric className="mt-2">{hitPct}%</Metric>
          <Text className="mt-2 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            精确 + 语义缓存合并（累计命中 / 累计请求）。
          </Text>
        </Card>

        <Card className="relative overflow-hidden ring-1 ring-emerald-500/35 ring-inset" decoration="top" decorationColor="emerald">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent" />
          <Text className="relative">累计节支（估算）</Text>
          <Metric className="relative mt-2 text-emerald-400 dark:text-emerald-300">
            ${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Metric>
          <Text className="relative mt-2 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            草稿跳过目标累计 <strong className="text-zinc-300">{skipped}</strong> 次（见网关指标）。
          </Text>
        </Card>
      </Grid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="ring-1 ring-zinc-800/80">
          <Title className="text-tremor-content-strong dark:text-dark-tremor-content-strong">
            {usingMockSeries ? "请求量（演示 24h）" : "每请求输出 tokens（最近样本）"}
          </Title>
          <Text className="mt-1 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            {usingMockSeries
              ? "真实按小时聚合尚未接入；以下为平滑示意曲线。"
              : "横轴为最近请求序号，纵轴为 prompt+completion tokens。"}
          </Text>
          <LineChart
            className="mt-4 h-64"
            data={chartData}
            index="idx"
            categories={["tokens"]}
            colors={["blue"]}
            yAxisWidth={52}
            showAnimation={false}
            curveType="monotone"
          />
        </Card>
        <Card className="ring-1 ring-zinc-800/80">
          <Title className="text-tremor-content-strong dark:text-dark-tremor-content-strong">
            {usingMockSeries ? "平均延迟（演示 24h）" : "端到端延迟（最近样本）"}
          </Title>
          <Text className="mt-1 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            {usingMockSeries ? "与上图同源演示数据。" : "同一批请求上的网关测得耗时（毫秒）。"}
          </Text>
          <LineChart
            className="mt-4 h-64"
            data={chartData}
            index="idx"
            categories={["latency"]}
            colors={["amber"]}
            yAxisWidth={56}
            valueFormatter={(v) => `${Math.round(v)} ms`}
            showAnimation={false}
            curveType="monotone"
          />
        </Card>
      </div>
    </div>
  );
}
