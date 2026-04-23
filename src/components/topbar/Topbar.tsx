import { NavTabs } from "@/components/topbar/NavTabs";

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0c]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-slate-950/80 p-2">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">GapGaps</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Arbitrage Console</div>
            </div>
          </div>
          <NavTabs />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-400 lg:block">
            Shell step active
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
          >
            Refresh View
          </button>
        </div>
      </div>
    </header>
  );
}
