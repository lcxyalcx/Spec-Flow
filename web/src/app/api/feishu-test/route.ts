import { NextRequest, NextResponse } from "next/server";

/**
 * 服务端代发飞书自定义机器人，避免浏览器直连 Webhook 的 CORS 限制。
 * @see https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 */
export async function POST(req: NextRequest) {
  let body: { webhookUrl?: string; text?: string };
  try {
    body = (await req.json()) as { webhookUrl?: string; text?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const url = (body.webhookUrl || "").trim();
  const text = (body.text || "SpecFlow：Webhook 测试消息").trim();
  if (!url.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "webhook_must_be_https" }, { status: 400 });
  }
  if (!url.includes("feishu.cn") && !url.includes("larksuite.com")) {
    return NextResponse.json({ ok: false, error: "host_not_allowed" }, { status: 400 });
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const raw = await r.text();
    return NextResponse.json({ ok: r.ok, status: r.status, body: raw.slice(0, 500) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
