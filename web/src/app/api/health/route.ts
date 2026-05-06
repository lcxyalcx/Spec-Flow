import { NextResponse } from "next/server";

function upstreamBase(): string {
  return (
    process.env.SPECFLOW_API_INTERNAL ||
    process.env.NEXT_PUBLIC_SPECFLOW_API_ORIGIN ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/** 聚合网关存活探测（供顶栏与编排器使用） */
export async function GET() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${upstreamBase()}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - t0;
    const body = await r.json().catch(() => ({}));
    return NextResponse.json({
      ok: r.ok,
      latency_ms: ms,
      gateway: body,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
