/** 模拟数据：后续可替换为 /api/metrics 聚合与 Prometheus 导出 */

export const mockKpis = {
  /** 网关聚合吞吐（示意） */
  throughputTokPerS: 1284,
  throughputDeltaPct: 18,
  /** 相对「仅目标模型、无 Pilot」基线的端到端延迟降幅 */
  latencyReductionPct: 34,
  /** 语义缓存 + 精确缓存合并命中率 */
  semanticCacheHitRatePct: 41.2,
  /** 估算累计节省（含草稿短路、缓存命中） */
  totalCostSavedUsd: 1847.32,
};

export type OverviewHourPoint = {
  hour: string;
  requests: number;
  avgLatencyMs: number;
};

/** 最近 24 小时（示意） */
export function buildMockHourlySeries(): OverviewHourPoint[] {
  const out: OverviewHourPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const t = (Date.now() - (23 - h) * 3600_000) / 3600_000;
    const wave = Math.sin(t / 3) * 120 + 400 + h * 8;
    out.push({
      hour: `${h.toString().padStart(2, "0")}:00`,
      requests: Math.round(wave + Math.random() * 40),
      avgLatencyMs: Math.round(180 + Math.cos(t / 2) * 45 + Math.random() * 20),
    });
  }
  return out;
}
