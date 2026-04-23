"use client";

import { AggregatedOpportunityRow } from "@/lib/opportunities/aggregator";

type OpportunityCardProps = {
  item: AggregatedOpportunityRow;
  onSelect?: (item: AggregatedOpportunityRow) => void;
};

function getTagTone(kind: AggregatedOpportunityRow["kind"]) {
  switch (kind) {
    case "basis":
      return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
    case "perp-perp":
      return "border-purple-300/25 bg-purple-400/10 text-purple-100";
    case "cex-cex":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "cex-dex":
      return "border-blue-300/25 bg-blue-400/10 text-blue-100";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function getKindLabel(kind: AggregatedOpportunityRow["kind"]) {
  switch (kind) {
    case "basis":
      return "BASIS";
    case "perp-perp":
      return "PERP-PERP";
    case "cex-cex":
      return "DOMESTIC";
    case "cex-dex":
      return "CEX-DEX";
    default:
      return "OPP";
  }
}

export function OpportunityCard({ item, onSelect }: OpportunityCardProps) {
  const positive = item.netPct >= 0;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className="w-full rounded-xl border border-white/10 bg-[#121317] p-4 text-left transition hover:border-cyan-300/30 hover:bg-[#16181d]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-white/10 pb-3">
        <span className="font-mono text-sm font-semibold tracking-[0.03em] text-white">{item.symbol}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getTagTone(item.kind)}`}>{getKindLabel(item.kind)}</span>
        <span className="text-xs text-slate-500">|</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">{item.exchangeFrom}</span>
        <span className="text-[10px] text-slate-500">→</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">{item.exchangeTo}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${item.chainCompat === "verified" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-slate-900/80 text-slate-400"}`}>
          {item.chainCompat === "verified" ? "verified" : "reference"}
        </span>
        <span className={`ml-auto font-mono text-sm font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{item.netPct >= 0 ? "+" : ""}{item.netPct.toFixed(2)}%</span>
        <span className="text-xs text-slate-500">👁</span>
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex items-start gap-2">
          <span className="mt-1 inline-block h-2 w-2 rounded-full bg-cyan-300" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">BUY</span>
              <span className="text-sm text-slate-200">{item.opportunity.buyExchange}</span>
              <span className="ml-auto font-mono text-sm font-semibold text-cyan-200">{item.buyPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
            </div>
            <div className="mt-2 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 pl-4 text-[11px]">
              <span className="font-mono text-slate-500">route</span>
              <span className="inline-flex rounded-md border border-white/10 bg-[#16181d] px-2 py-1 text-slate-300">{item.routeLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-1 inline-block h-2 w-2 rounded-full bg-rose-300" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">SELL</span>
              <span className="text-sm text-slate-200">{item.opportunity.sellExchange}</span>
              <span className="ml-auto font-mono text-sm font-semibold text-rose-200">{item.sellPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
            </div>
            <div className="mt-2 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 pl-4 text-[11px]">
              <span className="font-mono text-slate-500">source</span>
              <span className="inline-flex rounded-md border border-white/10 bg-[#16181d] px-2 py-1 text-slate-300">{item.sourceTitle}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-[11px] text-slate-500">
        <span className="font-mono">gap {item.gapPct >= 0 ? "+" : ""}{item.gapPct.toFixed(2)}%</span>
        <span className="font-mono">net {item.netPct >= 0 ? "+" : ""}{item.netPct.toFixed(2)}%</span>
        <span>{item.status === "ready" ? "ready" : "reference"}</span>
      </div>
    </button>
  );
}
