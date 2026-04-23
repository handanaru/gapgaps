"use client";

import { ConnectedStatus } from "@/components/sidebar/ConnectedStatus";
import { ExchangeFilter } from "@/components/sidebar/ExchangeFilter";
import { HighlightFilter } from "@/components/sidebar/HighlightFilter";
import { MarketTypeFilter } from "@/components/sidebar/MarketTypeFilter";
import { ThresholdFilter } from "@/components/sidebar/ThresholdFilter";
import { useDashboardFilters } from "@/lib/state/useFilters";

export function FilterSidebar() {
  const filters = useDashboardFilters();

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col rounded-xl border border-white/10 bg-[#0f1013] p-4 shadow-xl shadow-slate-950/40">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-[#121317] p-2">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={index} className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
          ))}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">GapGaps</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Arbitrage Console</div>
        </div>
      </div>

      <MarketTypeFilter value={filters.marketType} onChange={filters.setMarketType} />
      <ExchangeFilter values={filters.venues} onToggle={filters.toggleVenue} />
      <ThresholdFilter
        minGap={filters.minGap}
        executableOnly={filters.executableOnly}
        networkOnly={filters.networkOnly}
        onMinGapChange={filters.setMinGap}
        onExecutableOnlyChange={filters.setExecutableOnly}
        onNetworkOnlyChange={filters.setNetworkOnly}
      />
      <HighlightFilter value={filters.highlight} onChange={filters.setHighlight} />
      <ConnectedStatus />
    </div>
  );
}
