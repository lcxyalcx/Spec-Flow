"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FlaskConical, LayoutGrid, Settings2, Zap } from "lucide-react";
import { BackendStatus } from "@/components/console/backend-status";
import { cn } from "@/lib/utils";

const nav: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  badge?: string;
}[] = [
  { href: "/overview", label: "总览", icon: LayoutGrid },
  { href: "/pilot", label: "Pilot 试跑", icon: FlaskConical },
  { href: "/traces", label: "可观测性", icon: Activity },
  { href: "/settings", label: "配置中心", icon: Settings2 },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800/80 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-800/80 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-sky-500/20 ring-1 ring-emerald-500/30">
            <Zap className="h-5 w-5 text-emerald-400" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">SpecFlow</div>
            <div className="truncate text-[11px] text-zinc-500">Inference Console</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-zinc-800/90 text-white shadow-sm ring-1 ring-zinc-700/80"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
                <span className="flex-1 truncate font-medium">{label}</span>
                {badge ? (
                  <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-800/80 p-3 text-[11px] leading-relaxed text-zinc-500">
          开源可自托管：网关 FastAPI + 控制台 Next.js，详见仓库 README。
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-6 backdrop-blur">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Workspace</div>
            <div className="truncate text-sm font-semibold text-zinc-100">默认项目 · 生产网关</div>
          </div>
          <div className="flex items-center gap-2">
            <BackendStatus />
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              v0.3
            </span>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
