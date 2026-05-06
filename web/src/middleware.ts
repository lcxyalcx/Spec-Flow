import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** 本地 Next API 路由，勿转发到网关 */
const LOCAL_API = new Set(["/api/feishu-test", "/api/health"]);

function upstreamBase(): string {
  return (
    process.env.SPECFLOW_API_INTERNAL ||
    process.env.NEXT_PUBLIC_SPECFLOW_API_ORIGIN ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCAL_API.has(pathname)) {
    return NextResponse.next();
  }
  const dest = `${upstreamBase()}${pathname}${request.nextUrl.search}`;
  return NextResponse.rewrite(new URL(dest));
}

export const config = {
  matcher: ["/api/:path*", "/v1/:path*"],
};
