/** 浏览器本地配置（与配置中心 / Pilot 共享） */

export const LS = {
  base: "specflow_base_url",
  key: "specflow_api_key",
  model: "specflow_model",
  provider: "specflow_provider_id",
  verified: "specflow_verified_fingerprint",
  skipVerify: "specflow_skip_connection_verify",
  feishuWebhook: "specflow_feishu_webhook",
  feishuAlertLatency: "specflow_feishu_alert_latency",
  feishuAlertFailover: "specflow_feishu_alert_failover",
} as const;

export function connFingerprint(base: string, key: string, model: string) {
  return JSON.stringify({
    base: base.trim(),
    key: key.trim(),
    model: model.trim(),
  });
}

export type SpecflowConn = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  providerId: string;
  verifiedFingerprint: string | null;
  skipConnectionVerify: boolean;
};

export function loadConn(): SpecflowConn {
  if (typeof window === "undefined") {
    return {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      modelId: "gpt-4o-mini",
      providerId: "openai",
      verifiedFingerprint: null,
      skipConnectionVerify: false,
    };
  }
  try {
    return {
      baseUrl: localStorage.getItem(LS.base) || "https://api.openai.com/v1",
      apiKey: localStorage.getItem(LS.key) || "",
      modelId: localStorage.getItem(LS.model) || "gpt-4o-mini",
      providerId: localStorage.getItem(LS.provider) || "openai",
      verifiedFingerprint: localStorage.getItem(LS.verified),
      skipConnectionVerify: localStorage.getItem(LS.skipVerify) === "1",
    };
  } catch {
    return {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      modelId: "gpt-4o-mini",
      providerId: "openai",
      verifiedFingerprint: null,
      skipConnectionVerify: false,
    };
  }
}

function notifySpecflowConfig() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("specflow-config"));
  }
}

export function saveConn(p: Partial<SpecflowConn>) {
  if (typeof window === "undefined") return;
  try {
    if (p.baseUrl !== undefined) localStorage.setItem(LS.base, p.baseUrl);
    if (p.apiKey !== undefined) localStorage.setItem(LS.key, p.apiKey);
    if (p.modelId !== undefined) localStorage.setItem(LS.model, p.modelId);
    if (p.providerId !== undefined) localStorage.setItem(LS.provider, p.providerId);
    if (p.verifiedFingerprint !== undefined) {
      if (p.verifiedFingerprint) localStorage.setItem(LS.verified, p.verifiedFingerprint);
      else localStorage.removeItem(LS.verified);
    }
    if (p.skipConnectionVerify !== undefined) {
      localStorage.setItem(LS.skipVerify, p.skipConnectionVerify ? "1" : "0");
    }
    notifySpecflowConfig();
  } catch {
    /* ignore */
  }
}

export function isConnVerified(c: SpecflowConn): boolean {
  if (c.skipConnectionVerify) return true;
  if (!c.baseUrl.trim() || !c.apiKey.trim()) return false;
  const fp = connFingerprint(c.baseUrl, c.apiKey, c.modelId);
  return c.verifiedFingerprint === fp;
}

export type FeishuSettings = {
  webhookUrl: string;
  alertHighLatency: boolean;
  alertFailover: boolean;
};

export function loadFeishu(): FeishuSettings {
  if (typeof window === "undefined") {
    return { webhookUrl: "", alertHighLatency: true, alertFailover: true };
  }
  try {
    return {
      webhookUrl: localStorage.getItem(LS.feishuWebhook) || "",
      alertHighLatency: localStorage.getItem(LS.feishuAlertLatency) !== "0",
      alertFailover: localStorage.getItem(LS.feishuAlertFailover) !== "0",
    };
  } catch {
    return { webhookUrl: "", alertHighLatency: true, alertFailover: true };
  }
}

export function saveFeishu(p: Partial<FeishuSettings>) {
  if (typeof window === "undefined") return;
  try {
    if (p.webhookUrl !== undefined) localStorage.setItem(LS.feishuWebhook, p.webhookUrl);
    if (p.alertHighLatency !== undefined) {
      localStorage.setItem(LS.feishuAlertLatency, p.alertHighLatency ? "1" : "0");
    }
    if (p.alertFailover !== undefined) {
      localStorage.setItem(LS.feishuAlertFailover, p.alertFailover ? "1" : "0");
    }
  } catch {
    /* ignore */
  }
}
