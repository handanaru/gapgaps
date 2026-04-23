export function ConnectedStatus() {
  return (
    <section className="mt-auto border-t border-white/10 pt-4">
      <div className="rounded-xl border border-white/10 bg-[#121317] p-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
          Connected · polling 3s
        </div>
        <div className="mt-2 text-xs text-slate-500">USDT/KRW and venue health will move here in Step 3.</div>
      </div>
    </section>
  );
}
