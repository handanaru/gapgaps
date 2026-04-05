"use client";

import { useEffect, useMemo, useState } from "react";
import { ArbitrageOpportunity, NormalizedTicker } from "@/lib/types";
import { calculateArbitrage, calculateCrossExchangeArbitrage } from "@/lib/exchanges";

type ApiResponse = {
  success: boolean;
  data?: NormalizedTicker[];
  error?: string;
  fetchedAt?: number;
};

type FxResponse = {
  success: boolean;
  data?: { symbol: string; rate: number };
  error?: string;
  fetchedAt?: number;
};

const BINANCE_TAKER_FEE = 0.05;
const BITHUMB_TAKER_FEE = 0.04;
const OKX_TAKER_FEE = 0.05;
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
  const [binanceSpotTickers, setBinanceSpotTickers] = useState<NormalizedTicker[]>([]);
  const [binanceFuturesTickers, setBinanceFuturesTickers] = useState<NormalizedTicker[]>([]);
  const [bithumbSpotTickers, setBithumbSpotTickers] = useState<NormalizedTicker[]>([]);
  const [okxSpotTickers, setOkxSpotTickers] = useState<NormalizedTicker[]>([]);
  const [usdtKrwRate, setUsdtKrwRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [binanceSpotRes, binanceFuturesRes, bithumbRes, okxRes, fxRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/futures"),
          fetch("/api/bithumb/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/fx/usdt-krw"),
        ]);

        const [binanceSpotJson, binanceFuturesJson, bithumbJson, okxJson, fxJson] = (await Promise.all([
          binanceSpotRes.json(),
          binanceFuturesRes.json(),
          bithumbRes.json(),
          okxRes.json(),
          fxRes.json(),
        ])) as [ApiResponse, ApiResponse, ApiResponse, ApiResponse, FxResponse];

        if (
          !binanceSpotJson.success ||
          !binanceFuturesJson.success ||
          !bithumbJson.success ||
          !okxJson.success ||
          !fxJson.success ||
          !binanceSpotJson.data ||
          !binanceFuturesJson.data ||
          !bithumbJson.data ||
          !okxJson.data ||
          !fxJson.data
        ) {
          throw new Error(
            binanceSpotJson.error ||
              binanceFuturesJson.error ||
              bithumbJson.error ||
              okxJson.error ||
              fxJson.error ||
              "Failed to fetch market data"
          );
        }

        if (!cancelled) {
          setBinanceSpotTickers(binanceSpotJson.data);
          setBinanceFuturesTickers(binanceFuturesJson.data);
          setBithumbSpotTickers(bithumbJson.data);
          setOkxSpotTickers(okxJson.data);
          setUsdtKrwRate(fxJson.data.rate);
          setLastUpdated(
            Math.max(
              binanceSpotJson.fetchedAt ?? 0,
              binanceFuturesJson.fetchedAt ?? 0,
              bithumbJson.fetchedAt ?? 0,
              okxJson.fetchedAt ?? 0,
              fxJson.fetchedAt ?? 0
            )
          );
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

  const binanceInternalOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(binanceSpotTickers, binanceFuturesTickers, BINANCE_TAKER_FEE);
  }, [binanceSpotTickers, binanceFuturesTickers]);

  const bithumbOkxOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];
    return calculateCrossExchangeArbitrage(bithumbSpotTickers, okxSpotTickers, {
      leftFeePct: BITHUMB_TAKER_FEE,
      rightFeePct: OKX_TAKER_FEE,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "OKX Spot",
    });
  }, [bithumbSpotTickers, okxSpotTickers, usdtKrwRate]);

  const topBinance = binanceInternalOpportunities.slice(0, 15);
  const topCrossExchange = bithumbOkxOpportunities.slice(0, 15);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">GapGaps</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Crypto Arbitrage Monitor</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                Binance Spot/Futures와 Bithumb ↔ OKX 가격을 3초마다 폴링해서 순수익 기준 아비트라지 기회를 보여주는 로컬 대시보드.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              <div>{lastUpdated ? `마지막 업데이트: ${new Date(lastUpdated).toLocaleTimeString()}` : "데이터를 불러오는 중..."}</div>
              <div className="mt-1 text-xs text-cyan-200/80">USDT/KRW: {usdtKrwRate ? formatPrice(usdtKrwRate) : "-"}</div>
            </div>
          </div>
          {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">오류: {error}</div>}
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Binance Spot" value={binanceSpotTickers.length.toLocaleString()} hint="USDT 마켓 기준" />
          <SummaryCard label="Bithumb KRW" value={bithumbSpotTickers.length.toLocaleString()} hint="KRW 현물" />
          <SummaryCard label="OKX Spot" value={okxSpotTickers.length.toLocaleString()} hint="USDT 기준 비교" />
          <SummaryCard
            label="Cross Exchange Top"
            value={topCrossExchange[0] ? formatPct(topCrossExchange[0].estimatedNetPct) : loading ? "..." : "0.000%"}
            hint="Bithumb ↔ OKX 순수익"
          />
        </section>

        <OpportunitySection
          title="Binance Spot vs Futures"
          description="같은 거래소 내 Spot/Futures 가격 차이를 기준으로 추정 순수익을 계산합니다."
          opportunities={topBinance}
          loading={loading}
        />

        <OpportunitySection
          title="Bithumb KRW vs OKX Spot"
          description="Bithumb KRW 현물과 OKX 현물을 USDT/KRW 환산 기준으로 비교해 김프/역프 관점 기회를 보여줍니다."
          opportunities={topCrossExchange}
          loading={loading}
        />
      </div>
    </main>
  );
}

function OpportunitySection({
  title,
  description,
  opportunities,
  loading,
}: {
  title: string;
  description: string;
  opportunities: ArbitrageOpportunity[];
  loading: boolean;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
          Polling every {POLL_INTERVAL_MS / 1000}s
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              {["Symbol", "Buy Exchange", "Sell Exchange", "Buy Price", "Sell Price", "Gap %", "Estimated Net %"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-slate-950/40">
            {opportunities.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {loading ? "시장 데이터를 불러오는 중..." : "표시할 아비트라지 기회가 없습니다."}
                </td>
              </tr>
            ) : (
              opportunities.map((opportunity) => (
                <tr key={`${title}-${opportunity.symbol}-${opportunity.buyExchange}-${opportunity.sellExchange}`} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-white">{opportunity.symbol}</td>
                  <td className="px-4 py-3 text-slate-300">{opportunity.buyExchange}</td>
                  <td className="px-4 py-3 text-slate-300">{opportunity.sellExchange}</td>
                  <td className="px-4 py-3 text-slate-300">{formatPrice(opportunity.buyPrice)}</td>
                  <td className="px-4 py-3 text-slate-300">{formatPrice(opportunity.sellPrice)}</td>
                  <td className={`px-4 py-3 font-medium ${opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{formatPct(opportunity.gapPct)}</td>
                  <td className={`px-4 py-3 font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                    {formatPct(opportunity.estimatedNetPct)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
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
