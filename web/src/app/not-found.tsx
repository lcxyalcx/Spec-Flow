import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-100">页面不存在</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">路径可能已调整，请从侧栏返回控制台。</p>
      <Link
        href="/overview"
        className="mt-8 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        回到总览
      </Link>
    </div>
  );
}
