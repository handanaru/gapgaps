"use client";

import { EXCHANGE_OPTIONS } from "@/lib/state/useFilters";

export function ExchangeFilter({ values, onToggle }: { values: string[]; onToggle: (value: string) => void }) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Exchanges</div>
      <input
        readOnly
        value=""
        placeholder="Search venues…"
        className="w-full rounded-lg border border-white/10 bg-[#121317] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600"
      />
      <div className="flex flex-wrap gap-2">
        {EXCHANGE_OPTIONS.map((option) => {
          const active = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-[#121317] text-slate-400 hover:text-white"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </section>
  );
}
