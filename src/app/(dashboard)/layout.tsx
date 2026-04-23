import { Suspense } from "react";
import { FilterSidebar } from "@/components/sidebar/FilterSidebar";
import { Topbar } from "@/components/topbar/Topbar";

function ShellPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121317] p-4 shadow-lg shadow-slate-950/40">
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Step shell</div>
      <div className="mt-2 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#d7d9de]">
      <Topbar />
      <div className="mx-auto max-w-[1800px] px-4 py-4 lg:px-6">
        <div className="mb-4 xl:hidden">
          <details className="rounded-xl border border-white/10 bg-[#0f1013] p-4 shadow-lg shadow-slate-950/30">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">Open filters</summary>
            <div className="mt-4">
              <Suspense fallback={<ShellPanel title="Filter Sidebar" description="Loading filter controls…" />}>
                <FilterSidebar />
              </Suspense>
            </div>
          </details>
        </div>

        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px] xl:items-start">
          <aside className="hidden xl:block">
            <div className="sticky top-[88px] space-y-4">
              <Suspense fallback={<ShellPanel title="Filter Sidebar" description="Loading filter controls…" />}>
                <FilterSidebar />
              </Suspense>
            </div>
          </aside>
          <div className="min-w-0">{children}</div>
          <aside className="hidden xl:block">
            <div className="sticky top-[88px] space-y-4">
              <ShellPanel title="Aux Panel" description="Step 6에서 Hero / Status Metrics / Funding Spread / Action Feed를 이 자리로 분리합니다." />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
