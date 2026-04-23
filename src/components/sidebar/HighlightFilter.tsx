"use client";

import { HIGHLIGHT_OPTIONS } from "@/lib/state/useFilters";

export function HighlightFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Highlight</div>
      <div className="flex flex-wrap gap-2">
        {HIGHLIGHT_OPTIONS.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-[#121317] text-slate-400 hover:text-white"
              }`}
            >
              ≥{option}%
            </button>
          );
        })}
      </div>
    </section>
  );
}
