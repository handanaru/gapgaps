"use client";

import { useEffect, useMemo, useState } from "react";
import { BITHUMB_OKX_EFFECTIVE_FEE_PCT } from "@/lib/fees";
import { convertUsdtToKrw, sanitizeUsdKrw } from "@/lib/fx";
import type { KrwPremiumOpportunity, NormalizedMarketTicker } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

function mapByBase(tickers: NormalizedMarketTicker[], quote: "KRW" | "USDT") {
  return tickers
    .filter((ticker) => ticker.quote === quote)
    .reduce<Record<string, NormalizedMarketTicker>>((acc, ticker) => {
      acc[ticker.base] = ticker;
      return acc;
    }, {});
}

function computeKrwPremium(
  bithumbTickers: NormalizedMarketTicker[],
  okxTickers: NormalizedMarketTicker[],
  usdKrw: number
): KrwPremiumOpportunity[] {
  const bithumbMap = mapByBase(bithumbTickers, "KRW");
  const okxMap = mapByBase(okxTickers, "USDT");
  const opportunities: KrwPremiumOpportunity[] = [];

  for (const base of Object.keys(bithumbMap)) {
    if (!okxMap[base]) continue;

    const bithumbKrw = bithumbMap[base].price;
    const okxUsdt = okxMap[base].price;
    const okxKrw = convertUsdtToKrw(okxUsdt, usdKrw);

    if (!Number.isFinite(okxKrw) || okxKrw <= 0) continue;

    const premiumPct = ((bithumbKrw - okxKrw) / okxKrw) * 100;
    const netPct = Math.abs(premiumPct) - BITHUMB_OKX_EFFECTIVE_FEE_PCT;

    opportunities.push({
      base,
      bithumbSymbol: bithumbMap[base].symbol,
      okxSymbol: okxMap[base].symbol,
      bithumbKrw,
      okxUsdt,
      usdKrw,
      okxKrw,
      premiumPct,
      feePct: BITHUMB_OKX_EFFECTIVE_FEE_PCT,
      netPct,
      direction: premiumPct >= 0 ? "Buy OKX / Sell Bithumb" : "Buy Bithumb / Sell OKX"
    });
  }

  return opportunities.sort((a, b) => b.netPct - a.netPct).slice(0, 40);
}

export function KrwPremiumTable() {
  const [bithumbTickers, setBithumbTickers] = useState<NormalizedMarketTicker[]>([]);
  const [okxTickers, setOkxTickers] = useState<NormalizedMarketTicker[]>([]);
  const [usdKrw, setUsdKrw] = useState(1350);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [bithumbRes, okxRes, fxRes] = await Promise.all([
          fetch("/api/bithumb/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/fx/usdkrw")
        ]);

        if (!bithumbRes.ok || !okxRes.ok || !fxRes.ok) {
          throw new Error("Bithumb/OKX/환율 데이터 요청에 실패했습니다.");
        }

        const bithumbData = (await bithumbRes.json()) as {
          tickers: NormalizedMarketTicker[];
          updatedAt: string;
        };
        const okxData = (await okxRes.json()) as {
          tickers: NormalizedMarketTicker[];
          updatedAt: string;
        };
        const fxData = (await fxRes.json()) as {
          usdKrw: number;
          updatedAt: string;
        };

        if (!active) return;

        setBithumbTickers(bithumbData.tickers);
        setOkxTickers(okxData.tickers);
        setUsdKrw(sanitizeUsdKrw(fxData.usdKrw));
        setUpdatedAt(fxData.updatedAt);
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

  const opportunities = useMemo(
    () => computeKrwPremium(bithumbTickers, okxTickers, usdKrw),
    [bithumbTickers, okxTickers, usdKrw]
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Bithumb(KRW) ↔ OKX(USDT) 김프/차익 테이블</h2>
        <p className="text-sm text-slate-400">업데이트: {updatedAt ?? "-"}</p>
      </div>

      <p className="text-sm text-slate-400">적용 환율: 1 USD = {usdKrw.toLocaleString()} KRW</p>

      {loading && <p className="text-slate-400">데이터 로딩 중...</p>}
      {error && <p className="text-rose-300">오류: {error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-300">
              <th className="px-3 py-2">코인</th>
              <th className="px-3 py-2">Bithumb (KRW)</th>
              <th className="px-3 py-2">OKX (USDT)</th>
              <th className="px-3 py-2">OKX 환산 (KRW)</th>
              <th className="px-3 py-2">프리미엄(%)</th>
              <th className="px-3 py-2">수수료(%)</th>
              <th className="px-3 py-2">순기회(%)</th>
              <th className="px-3 py-2">전략</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((item) => (
              <tr key={item.base} className="border-b border-slate-800/70">
                <td className="px-3 py-2 font-medium">{item.base}</td>
                <td className="px-3 py-2">{item.bithumbKrw.toLocaleString()}</td>
                <td className="px-3 py-2">{item.okxUsdt.toLocaleString()}</td>
                <td className="px-3 py-2">{item.okxKrw.toLocaleString()}</td>
                <td className={`px-3 py-2 ${item.premiumPct >= 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {item.premiumPct.toFixed(3)}
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
