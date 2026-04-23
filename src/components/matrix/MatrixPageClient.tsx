"use client";

import { useEffect, useMemo, useState } from "react";
import { NormalizedTicker } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

type ApiResponse = {
  success: boolean;
  data?: NormalizedTicker[];
  error?: string;
};

type FxResponse = {
  success: boolean;
  rate?: number;
  error?: string;
};

type MatrixRow = {
  base: string;
  bithumbKrw: number | null;
  upbitKrw: number | null;
  okxKrw: number | null;
  binanceKrw: number | null;
  bybitKrw: number | null;
  gateioKrw: number | null;
  spreadPct: number;
};

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function MatrixPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bithumb, setBithumb] = useState<NormalizedTicker[]>([]);
  const [upbit, setUpbit] = useState<NormalizedTicker[]>([]);
  const [okx, setOkx] = useState<NormalizedTicker[]>([]);
  const [binance, setBinance] = useState<NormalizedTicker[]>([]);
  const [bybit, setBybit] = useState<NormalizedTicker[]>([]);
  const [gateio, setGateio] = useState<NormalizedTicker[]>([]);
  const [usdtKrwRate, setUsdtKrwRate] = useState<number | null>(null);
  const [minSpreadFilter, setMinSpreadFilter] = useState(0);
  const [requireFutures, setRequireFutures] = useState(false);
  const [binancePerpBases, setBinancePerpBases] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      try {
        const [bithumbRes, upbitRes, okxRes, binanceRes, bybitRes, gateioRes, fxRes, binancePerpRes] = await Promise.all([
          fetch("/api/bithumb/spot"),
          fetch("/api/upbit/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/binance/spot"),
          fetch("/api/bybit/spot"),
          fetch("/api/gateio/spot"),
          fetch("/api/fx/usdt-krw"),
          fetch("/api/binance/perp"),
        ]);

        const [bithumbJson, upbitJson, okxJson, binanceJson, bybitJson, gateioJson, fxJson, binancePerpJson] = await Promise.all([
          bithumbRes.json() as Promise<ApiResponse>,
          upbitRes.json() as Promise<ApiResponse>,
          okxRes.json() as Promise<ApiResponse>,
          binanceRes.json() as Promise<ApiResponse>,
          bybitRes.json() as Promise<ApiResponse>,
          gateioRes.json() as Promise<ApiResponse>,
          fxRes.json() as Promise<FxResponse>,
          binancePerpRes.json() as Promise<ApiResponse>,
        ]);

        if (!mounted) return;

        if (!bithumbJson.success || !upbitJson.success || !okxJson.success || !binanceJson.success || !bybitJson.success || !gateioJson.success || !fxJson.success || !binancePerpJson.success) {
          throw new Error(
            bithumbJson.error || upbitJson.error || okxJson.error || binanceJson.error || bybitJson.error || gateioJson.error || fxJson.error || binancePerpJson.error || "Matrix fetch failed"
          );
        }

        setBithumb(bithumbJson.data ?? []);
        setUpbit(upbitJson.data ?? []);
        setOkx(okxJson.data ?? []);
        setBinance(binanceJson.data ?? []);
        setBybit(bybitJson.data ?? []);
        setGateio(gateioJson.data ?? []);
        setUsdtKrwRate(fxJson.rate ?? null);
        setBinancePerpBases((binancePerpJson.data ?? []).map((item) => item.base));
        setError(null);
      } catch (fetchError) {
        if (!mounted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Matrix fetch failed");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAll();
    const interval = window.setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const rows = useMemo(() => {
    if (!usdtKrwRate) return [] as MatrixRow[];

    const binanceMap = new Map(binance.map((ticker) => [ticker.base, ticker]));
    const bithumbMap = new Map(bithumb.map((ticker) => [ticker.base, ticker]));
    const upbitMap = new Map(upbit.map((ticker) => [ticker.base, ticker]));
    const okxMap = new Map(okx.map((ticker) => [ticker.base, ticker]));
    const bybitMap = new Map(bybit.map((ticker) => [ticker.base, ticker]));
    const gateioMap = new Map(gateio.map((ticker) => [ticker.base, ticker]));
    const perpBaseSet = new Set(binancePerpBases);

    const bases = Array.from(new Set([
      ...Array.from(bithumbMap.keys()),
      ...Array.from(upbitMap.keys()),
      ...Array.from(okxMap.keys()),
      ...Array.from(binanceMap.keys()),
      ...Array.from(bybitMap.keys()),
      ...Array.from(gateioMap.keys()),
    ])).sort();

    return bases
      .map((base) => {
        if (requireFutures && !perpBaseSet.has(base)) return null;

        const bithumbKrw = bithumbMap.get(base)?.price ?? null;
        const upbitKrw = upbitMap.get(base)?.price ?? null;
        const okxKrw = okxMap.get(base)?.price ? okxMap.get(base)!.price * usdtKrwRate : null;
        const binanceKrw = binanceMap.get(base)?.price ? binanceMap.get(base)!.price * usdtKrwRate : null;
        const bybitKrw = bybitMap.get(base)?.price ? bybitMap.get(base)!.price * usdtKrwRate : null;
        const gateioKrw = gateioMap.get(base)?.price ? gateioMap.get(base)!.price * usdtKrwRate : null;
        const compared = [bithumbKrw, upbitKrw, okxKrw, binanceKrw, bybitKrw, gateioKrw].filter((value): value is number => value !== null && Number.isFinite(value));
        if (compared.length < 2) return null;
        const minPrice = Math.min(...compared);
        const maxPrice = Math.max(...compared);
        return {
          base,
          bithumbKrw,
          upbitKrw,
          okxKrw,
          binanceKrw,
          bybitKrw,
          gateioKrw,
          spreadPct: ((maxPrice - minPrice) / minPrice) * 100,
        } satisfies MatrixRow;
      })
      .filter((row): row is MatrixRow => Boolean(row))
      .filter((row) => row.spreadPct >= minSpreadFilter)
      .sort((a, b) => b.spreadPct - a.spreadPct)
      .slice(0, 50);
  }, [binance, binancePerpBases, bithumb, bybit, gateio, minSpreadFilter, okx, requireFutures, upbit, usdtKrwRate]);

  return (
    <main className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-[#121317] p-6 shadow-lg shadow-slate-950/40">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">Matrix</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Full Market Scan Matrix</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Radar에서 참고 레이어로 남아 있던 전체 시세 매트릭스를 이제 독립 라우트로 분리했습니다.</p>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121317] p-6 shadow-lg shadow-slate-950/40">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Reference Matrix</div>
            <div className="mt-2 text-sm text-slate-400">빗썸 / 업비트 / OKX / Binance / Bybit / Gate.io spot 가격을 KRW 기준으로 비교합니다.</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-white/10 bg-[#16181d] px-3 py-2 text-xs font-medium text-slate-300">
              <input type="checkbox" checked={requireFutures} onChange={(event) => setRequireFutures(event.target.checked)} className="accent-cyan-400" />
              선물 종목만 보기
            </label>
            <label className="flex items-center gap-2 rounded-full border border-white/10 bg-[#16181d] px-3 py-2 text-xs font-medium text-slate-300">
              최소 스프레드
              <select value={minSpreadFilter} onChange={(event) => setMinSpreadFilter(Number(event.target.value))} className="rounded-md border border-white/10 bg-[#0f1013] px-2 py-1 text-xs text-slate-100">
                <option value={0}>0%</option>
                <option value={0.1}>0.1%</option>
                <option value={0.3}>0.3%</option>
                <option value={0.5}>0.5%</option>
                <option value={1}>1.0%</option>
              </select>
            </label>
            <span className="rounded-full border border-white/10 bg-[#16181d] px-3 py-2 text-xs text-slate-400">USDT/KRW {usdtKrwRate ? formatPrice(usdtKrwRate) : "-"}</span>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="min-w-full table-fixed divide-y divide-white/10 text-sm">
            <thead className="bg-[#0f1013] text-slate-300">
              <tr>
                {['Base','Bithumb KRW','Upbit KRW','OKX KRW','Binance KRW','Bybit KRW','Gate.io KRW','Spread %'].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    {loading ? 'Loading matrix…' : 'No matrix rows detected.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.base} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">{row.base}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.bithumbKrw)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.upbitKrw)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.okxKrw)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.binanceKrw)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.bybitKrw)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(row.gateioKrw)}</td>
                    <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${row.spreadPct > 0.5 ? 'text-emerald-400' : 'text-slate-300'}`}>{formatPct(row.spreadPct)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
