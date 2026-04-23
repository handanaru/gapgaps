"use client";

export function ThresholdFilter({
  minGap,
  executableOnly,
  networkOnly,
  onMinGapChange,
  onExecutableOnlyChange,
  onNetworkOnlyChange,
}: {
  minGap: string;
  executableOnly: boolean;
  networkOnly: boolean;
  onMinGapChange: (value: string) => void;
  onExecutableOnlyChange: (checked: boolean) => void;
  onNetworkOnlyChange: (checked: boolean) => void;
}) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Thresholds</div>
      <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">
        Min Gap %
        <input
          value={minGap}
          onChange={(event) => onMinGapChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-white/10 bg-[#121317] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#121317] px-3 py-2 text-sm text-slate-300">
        <input type="checkbox" checked={executableOnly} onChange={(event) => onExecutableOnlyChange(event.target.checked)} className="accent-cyan-400" />
        실행 가능만 보기
      </label>
      <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#121317] px-3 py-2 text-sm text-slate-300">
        <input type="checkbox" checked={networkOnly} onChange={(event) => onNetworkOnlyChange(event.target.checked)} className="accent-cyan-400" />
        네트워크 호환성만
      </label>
    </section>
  );
}
