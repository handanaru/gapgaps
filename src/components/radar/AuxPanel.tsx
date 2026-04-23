"use client";

import { useAuxPanelState } from "@/components/radar/aux-panel-context";

export function AuxPanel() {
  const { state } = useAuxPanelState();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-300/15 bg-[#121317] p-4 shadow-lg shadow-slate-950/40">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">Hero Opportunity</div>
        {state.heroTitle ? (
          <>
            <div className="mt-3 text-2xl font-semibold text-white">{state.heroTitle}</div>
            <div className="mt-1 text-sm text-slate-300">{state.heroRoute}</div>
            <div className="mt-3 flex gap-3 text-sm">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">Net {state.heroNetPct}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">Gap {state.heroGapPct}</span>
            </div>
          </>
        ) : (
          <div className="mt-2 text-sm text-slate-500">No active hero opportunity detected.</div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121317] p-4 shadow-lg shadow-slate-950/40">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Status Metrics</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {state.statusMetrics.length > 0 ? state.statusMetrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-[#16181d] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
              <div className={`mt-2 text-lg font-semibold ${metric.tone ?? "text-white"}`}>{metric.value}</div>
            </div>
          )) : <div className="col-span-2 text-sm text-slate-500">No active status metrics detected.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121317] p-4 shadow-lg shadow-slate-950/40">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Funding Spread Top</div>
        <div className="mt-3 space-y-2">
          {state.fundingTop.length > 0 ? state.fundingTop.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-[#16181d] px-3 py-3">
              <div className="text-sm font-medium text-white">{item.title}</div>
              <div className="mt-1 text-xs text-slate-500">{item.subtitle}</div>
              {item.value ? <div className="mt-2 font-mono text-sm text-cyan-200">{item.value}</div> : null}
            </div>
          )) : <div className="text-sm text-slate-500">No active funding spread detected.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121317] p-4 shadow-lg shadow-slate-950/40">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Action Feed</div>
        <div className="mt-3 space-y-2">
          {state.actionFeed.length > 0 ? state.actionFeed.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-[#16181d] px-3 py-3">
              <div className="text-sm font-medium text-white">{item.title}</div>
              <div className="mt-1 text-xs text-slate-500">{item.subtitle}</div>
              {item.value ? <div className="mt-2 text-xs text-slate-400">{item.value}</div> : null}
            </div>
          )) : <div className="text-sm text-slate-500">No active actions detected.</div>}
        </div>
      </div>
    </div>
  );
}
