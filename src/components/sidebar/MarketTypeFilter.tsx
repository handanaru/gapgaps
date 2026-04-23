"use client";

import { MARKET_TYPE_OPTIONS } from "@/lib/state/useFilters";

export function MarketTypeFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Market Type</div>
      <div className="grid gap-2">
        {MARKET_TYPE_OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                active
                  ? "border-cyan-300/30 bg-slate-800 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "border-white/10 bg-[#121317] text-slate-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
