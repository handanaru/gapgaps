"use client";

import { useEffect, useMemo, useState } from "react";
import { ROUND_TRIP_BINANCE_FEE_PCT } from "@/lib/fees";
import type { ArbitrageOpportunity, NormalizedMarketTicker } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

function toMap(tickers: NormalizedMarketTicker[]) {
  return tickers.reduce<Record<string, NormalizedMarketTicker>>((acc, ticker) => {
    if (ticker.quote !== "USDT") return acc;
    acc[ticker.base] = ticker;
    return acc;
  }, {});
}

function computeOpportunities(
  spot: NormalizedMarketTicker[],
  perp: NormalizedMarketTicker[]
): ArbitrageOpportunity[] {
  const spotMap = toMap(spot);
  const perpMap = toMap(perp);

  const opportunities: ArbitrageOpportunity[] = [];

  for (const base of Object.keys(spotMap)) {
    if (!perpMap[base]) continue;

    const symbol = `${base}USDT`;
    const spotPrice = spotMap[base].price;
    const perpPrice = perpMap[base].price;
    const gapPct = ((perpPrice - spotPrice) / spotPrice) * 100;
    const netPct = Math.abs(gapPct) - ROUND_TRIP_BINANCE_FEE_PCT;

    opportunities.push({
      symbol,
      spotPrice,
      perpPrice,
      gapPct,
      feePct: ROUND_TRIP_BINANCE_FEE_PCT,
      netPct,
      direction: gapPct >= 0 ? "Buy Spot / Sell Perp" : "Sell Spot / Buy Perp"
    });
  }

  return opportunities.sort((a, b) => b.netPct - a.netPct).slice(0, 40);
}

export function ArbitrageTable() {
  const [spot, setSpot] = useState<NormalizedMarketTicker[]>([]);
  const [perp, setPerp] = useState<NormalizedMarketTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [spotRes, perpRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/futures")
        ]);

        if (!spotRes.ok || !perpRes.ok) {
          throw new Error("Binance 프록시 요청에 실패했습니다.");
        }

        const spotData = (await spotRes.json()) as { tickers: NormalizedMarketTicker[]; updatedAt: string };
        const perpData = (await perpRes.json()) as { tickers: NormalizedMarketTicker[]; updatedAt: string };

        if (!active) return;

        setSpot(spotData.tickers);
        setPerp(perpData.tickers);
        setUpdatedAt(perpData.updatedAt);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      } finally {
        if (active) setLoading(false);
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const opportunities = useMemo(() => computeOpportunities(spot, perp), [spot, perp]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Binance Spot ↔ Perp 아비트라지 (USDT)</h2>
        <p className="text-sm text-slate-400">업데이트: {updatedAt ?? "-"}</p>
      </div>

      {loading && <p className="text-slate-400">데이터 로딩 중...</p>}
      {error && <p className="text-rose-300">오류: {error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-300">
              <th className="px-3 py-2">심볼</th>
              <th className="px-3 py-2">Spot</th>
              <th className="px-3 py-2">Perp</th>
              <th className="px-3 py-2">갭(%)</th>
              <th className="px-3 py-2">수수료(%)</th>
              <th className="px-3 py-2">순수익(%)</th>
              <th className="px-3 py-2">전략</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((item) => (
              <tr key={item.symbol} className="border-b border-slate-800/70">
                <td className="px-3 py-2 font-medium">{item.symbol}</td>
                <td className="px-3 py-2">{item.spotPrice.toLocaleString()}</td>
                <td className="px-3 py-2">{item.perpPrice.toLocaleString()}</td>
                <td className={`px-3 py-2 ${item.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                  {item.gapPct.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-slate-400">{item.feePct.toFixed(3)}</td>
                <td className={`px-3 py-2 font-semibold ${item.netPct > 0 ? "text-emerald-300" : "text-slate-300"}`}>
                  {item.netPct.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-slate-300">{item.direction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
