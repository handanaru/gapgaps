"use client";

import { useEffect, useMemo, useState } from "react";
import { ArbitrageOpportunity, NormalizedTicker } from "@/lib/types";
import { calculateArbitrage } from "@/lib/binance";

type ApiResponse = {
  success: boolean;
  data?: NormalizedTicker[];
  error?: string;
  fetchedAt?: number;
};

const BINANCE_TAKER_FEE = 0.05;
const POLL_INTERVAL_MS = 3000;

function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
}

export default function Home() {
  const [spotTickers, setSpotTickers] = useState<NormalizedTicker[]>([]);
  const [futuresTickers, setFuturesTickers] = useState<NormalizedTicker[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [spotRes, futuresRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/futures"),
        ]);

        const [spotJson, futuresJson] = (await Promise.all([spotRes.json(), futuresRes.json()])) as [ApiResponse, ApiResponse];

        if (!spotJson.success || !futuresJson.success || !spotJson.data || !futuresJson.data) {
          throw new Error(spotJson.error || futuresJson.error || "Failed to fetch market data");
        }

        if (!cancelled) {
          setSpotTickers(spotJson.data);
          setFuturesTickers(futuresJson.data);
          setLastUpdated(Math.max(spotJson.fetchedAt ?? 0, futuresJson.fetchedAt ?? 0));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const opportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(spotTickers, futuresTickers, BINANCE_TAKER_FEE);
  }, [spotTickers, futuresTickers]);

  const visibleOpportunities = opportunities.slice(0, 30);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">GapGaps</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Crypto Arbitrage Monitor</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                Binance Spot vs Binance Futures 가격 갭을 3초마다 폴링해서 순수익 기준 아비트라지 기회를 보여주는 Phase 1 대시보드.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {lastUpdated ? `마지막 업데이트: ${new Date(lastUpdated).toLocaleTimeString()}` : "데이터를 불러오는 중..."}
            </div>
          </div>
          {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">오류: {error}</div>}
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Spot 심볼 수" value={spotTickers.length.toLocaleString()} hint="USDT 마켓 기준" />
          <SummaryCard label="유효 기회 수" value={opportunities.filter((item) => item.estimatedNetPct > 0).length.toLocaleString()} hint="순수익 > 0" />
          <SummaryCard label="최대 예상 순수익" value={opportunities[0] ? formatPct(opportunities[0].estimatedNetPct) : loading ? "..." : "0.000%"} hint={`Binance taker ${BINANCE_TAKER_FEE}% 차감`} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Arbitrage Opportunities</h2>
              <p className="mt-1 text-sm text-slate-400">Spot과 Futures 가격 차이를 기준으로 추정 순수익을 계산합니다.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
              Polling every {POLL_INTERVAL_MS / 1000}s
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  {[
                    "Symbol",
                    "Spot Price",
                    "Futures Price",
                    "Gap %",
                    "Estimated Net %",
                    "Long Leg",
                    "Short Leg",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/40">
                {visibleOpportunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      {loading ? "시장 데이터를 불러오는 중..." : "표시할 아비트라지 기회가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  visibleOpportunities.map((opportunity) => (
                    <tr key={opportunity.symbol} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-white">{opportunity.symbol}</td>
                      <td className="px-4 py-3 text-slate-300">{formatPrice(opportunity.spotPrice)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatPrice(opportunity.futuresPrice)}</td>
                      <td className={`px-4 py-3 font-medium ${opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                        {formatPct(opportunity.gapPct)}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                        {formatPct(opportunity.estimatedNetPct)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{opportunity.longLeg}</td>
                      <td className="px-4 py-3 text-slate-300">{opportunity.shortLeg}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-slate-950/30">
      <p className="text-sm text-slate-400">{label}</p>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
