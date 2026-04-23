"use client";

import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { AggregatedOpportunityRow, OpportunityFilterKind } from "@/lib/opportunities/aggregator";

type OpportunityPanelProps = {
  items: AggregatedOpportunityRow[];
  minGap: string;
  marketType: string;
  executableOnly: boolean;
  hiddenCount?: number;
  shownCount: number;
  totalCount: number;
  onSelect: (item: AggregatedOpportunityRow) => void;
  onMarketTypeChange: (value: OpportunityFilterKind) => void;
  onExecutableOnlyChange: (checked: boolean) => void;
  onMinGapChange: (value: string) => void;
  onShowMore: () => void;
};

const MARKET_SEGMENTS: Array<{ key: OpportunityFilterKind; label: string }> = [
  { key: "all", label: "All" },
  { key: "basis", label: "Spot" },
  { key: "perp-perp", label: "Perp" },
  { key: "cex-cex", label: "CEX-CEX" },
  { key: "cex-dex", label: "CEX-DEX" },
];

export function OpportunityPanel({
  items,
  minGap,
  marketType,
  executableOnly,
  hiddenCount = 0,
  shownCount,
  totalCount,
  onSelect,
  onMarketTypeChange,
  onExecutableOnlyChange,
  onMinGapChange,
  onShowMore,
}: OpportunityPanelProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#121317] shadow-lg shadow-slate-950/40">
      <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Arbitrage Opportunities</div>
          <h2 className="mt-2 text-lg font-semibold text-white">Arbitrage Opportunities</h2>
          <div className="mt-1 font-mono text-[11px] text-slate-500">&gt;={minGap}% ({items.length}) | List {totalCount}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#16181d] px-3 py-2 text-xs text-slate-400">
            <span className="uppercase tracking-[0.18em]">MIN</span>
            <input
              value={minGap}
              onChange={(event) => onMinGapChange(event.target.value)}
              className="w-14 bg-transparent text-right font-mono text-sm text-white outline-none"
            />
            <span>%</span>
          </label>
          <div className="rounded-lg border border-white/10 bg-[#16181d] px-3 py-2 text-xs text-slate-400">{hiddenCount} hidden</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 xl:flex-row xl:items-center">
        <div className="inline-flex rounded-xl border border-white/10 bg-[#0f1013] p-1">
          {MARKET_SEGMENTS.map((segment) => {
            const active = marketType === segment.key;
            return (
              <button
                key={segment.key}
                type="button"
                onClick={() => onMarketTypeChange(segment.key)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[#16181d] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {segment.label}
              </button>
            );
          })}
        </div>

        <label className="xl:ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#16181d] px-4 py-2 text-sm text-slate-300">
          <input type="checkbox" checked={executableOnly} onChange={(event) => onExecutableOnlyChange(event.target.checked)} className="accent-cyan-400" />
          실행 가능만 보기
        </label>
      </div>

      <div className="space-y-3 px-4 py-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0f1013] px-4 py-10 text-center text-sm text-slate-500">
            No active opportunities detected.
          </div>
        ) : (
          items.map((item) => <OpportunityCard key={item.id} item={item} onSelect={onSelect} />)
        )}
      </div>

      <div className="flex items-center justify-center gap-4 border-t border-white/10 px-4 py-4 text-sm">
        <button type="button" onClick={onShowMore} className="font-medium uppercase tracking-[0.12em] text-cyan-200 transition hover:text-cyan-100">
          Show 20 more
        </button>
        <span className="font-mono text-slate-500">{shownCount} / {totalCount}</span>
        <span className="text-slate-500">▾</span>
      </div>
    </section>
  );
}
