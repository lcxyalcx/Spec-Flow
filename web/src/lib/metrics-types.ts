export type MetricsRecentRow = {
  ts: number;
  latency_ms: number;
  cache_hit: boolean;
  mode: string;
  intent: string;
  target_model: string;
  draft_model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  upstream_index: number;
  speculative_saved_second_call: boolean;
};

export type MetricsSnapshot = {
  version?: string;
  uptime_s?: number;
  totals: {
    requests: number;
    cache_hits: number;
    tokens_prompt: number;
    tokens_completion: number;
    latency_ms_sum: number;
    cost_usd_estimate: number;
    speculative_skipped_target: number;
  };
  avg_latency_ms: number;
  cache_hit_rate: number;
  derived?: {
    throughput_tok_per_s: number | null;
    latency_reduction_pct: number | null;
  };
  recent: MetricsRecentRow[];
};
