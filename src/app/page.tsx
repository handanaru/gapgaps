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

const DEFAULT_BINANCE_TAKER_FEE = 0.05;
const DEFAULT_BITHUMB_TAKER_FEE = 0.04;
const DEFAULT_OKX_TAKER_FEE = 0.05;
const POLL_INTERVAL_MS = 3000;
const ALERT_THRESHOLD_PCT = 1;

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
  const [okxPerpTickers, setOkxPerpTickers] = useState<NormalizedTicker[]>([]);
  const [usdtKrwRate, setUsdtKrwRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [minSpreadFilter, setMinSpreadFilter] = useState(0.5);
  const [matrixRequireFutures, setMatrixRequireFutures] = useState(true);
  const [binanceFeePct, setBinanceFeePct] = useState(DEFAULT_BINANCE_TAKER_FEE);
  const [bithumbFeePct, setBithumbFeePct] = useState(DEFAULT_BITHUMB_TAKER_FEE);
  const [okxFeePct, setOkxFeePct] = useState(DEFAULT_OKX_TAKER_FEE);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [binanceSpotRes, binanceFuturesRes, bithumbRes, okxRes, okxPerpRes, fxRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/futures"),
          fetch("/api/bithumb/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/okx/perp"),
          fetch("/api/fx/usdt-krw"),
        ]);

        const [binanceSpotJson, binanceFuturesJson, bithumbJson, okxJson, okxPerpJson, fxJson] = (await Promise.all([
          binanceSpotRes.json(),
          binanceFuturesRes.json(),
          bithumbRes.json(),
          okxRes.json(),
          okxPerpRes.json(),
          fxRes.json(),
        ])) as [ApiResponse, ApiResponse, ApiResponse, ApiResponse, ApiResponse, FxResponse];

        if (
          !binanceSpotJson.success ||
          !binanceFuturesJson.success ||
          !bithumbJson.success ||
          !okxJson.success ||
          !okxPerpJson.success ||
          !fxJson.success ||
          !binanceSpotJson.data ||
          !binanceFuturesJson.data ||
          !bithumbJson.data ||
          !okxJson.data ||
          !okxPerpJson.data ||
          !fxJson.data
        ) {
          throw new Error(
            binanceSpotJson.error ||
              binanceFuturesJson.error ||
              bithumbJson.error ||
              okxJson.error ||
              okxPerpJson.error ||
              fxJson.error ||
              "Failed to fetch market data"
          );
        }

        if (!cancelled) {
          setBinanceSpotTickers(binanceSpotJson.data);
          setBinanceFuturesTickers(binanceFuturesJson.data);
          setBithumbSpotTickers(bithumbJson.data);
          setOkxSpotTickers(okxJson.data);
          setOkxPerpTickers(okxPerpJson.data);
          setUsdtKrwRate(fxJson.data.rate);
          setLastUpdated(
            Math.max(
              binanceSpotJson.fetchedAt ?? 0,
              binanceFuturesJson.fetchedAt ?? 0,
              bithumbJson.fetchedAt ?? 0,
              okxJson.fetchedAt ?? 0,
              okxPerpJson.fetchedAt ?? 0,
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
    return calculateArbitrage(binanceSpotTickers, binanceFuturesTickers, binanceFeePct);
  }, [binanceSpotTickers, binanceFuturesTickers, binanceFeePct]);

  const bithumbOkxOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];
    return calculateCrossExchangeArbitrage(bithumbSpotTickers, okxSpotTickers, {
      leftFeePct: bithumbFeePct,
      rightFeePct: okxFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "OKX Spot",
    });
  }, [bithumbSpotTickers, okxSpotTickers, usdtKrwRate, bithumbFeePct, okxFeePct]);

  const okxInternalOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(okxSpotTickers, okxPerpTickers, okxFeePct);
  }, [okxSpotTickers, okxPerpTickers, okxFeePct]);

  const topBinance = binanceInternalOpportunities.slice(0, 15);
  const topOkx = okxInternalOpportunities.slice(0, 15);
  const topCrossExchange = bithumbOkxOpportunities.filter((item) => item.gapPct >= minSpreadFilter).slice(0, 15);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || notificationPermission !== "granted") return;
    if (topCrossExchange.length === 0) return;

    const top = topCrossExchange[0];
    if (top.estimatedNetPct < ALERT_THRESHOLD_PCT) return;

    const notificationId = `gapgaps:${top.symbol}:${top.buyExchange}:${top.sellExchange}:${top.estimatedNetPct.toFixed(3)}`;
    const notified = sessionStorage.getItem(notificationId);
    if (notified) return;

    sessionStorage.setItem(notificationId, "1");
    new Notification("GapGaps Opportunity", {
      body: `${top.symbol} ${top.buyExchange} → ${top.sellExchange} | 예상 순수익 ${top.estimatedNetPct.toFixed(3)}%`,
    });
  }, [notificationsEnabled, notificationPermission, topCrossExchange]);

  const priceMatrixRows = useMemo(() => {
    if (!usdtKrwRate) return [];

    const binanceMap = new Map(binanceSpotTickers.map((ticker) => [ticker.base, ticker]));
    const binanceFuturesBaseSet = new Set(binanceFuturesTickers.map((ticker) => ticker.base));
    const bithumbMap = new Map(bithumbSpotTickers.map((ticker) => [ticker.base, ticker]));
    const okxMap = new Map(okxSpotTickers.map((ticker) => [ticker.base, ticker]));

    const bases = Array.from(
      new Set([
        ...Array.from(bithumbMap.keys()),
        ...Array.from(okxMap.keys()),
        ...Array.from(binanceMap.keys()),
      ])
    ).sort();

    return bases
      .map((base) => {
        if (matrixRequireFutures && !binanceFuturesBaseSet.has(base)) return null;

        const bithumb = bithumbMap.get(base);
        const okx = okxMap.get(base);
        const binance = binanceMap.get(base);

        const bithumbKrw = bithumb?.price ?? null;
        const okxKrw = okx ? okx.price * usdtKrwRate : null;
        const binanceKrw = binance ? binance.price * usdtKrwRate : null;

        const compared = [bithumbKrw, okxKrw, binanceKrw].filter((value): value is number => value !== null && Number.isFinite(value));
        if (compared.length < 2) return null;

        const minPrice = Math.min(...compared);
        const maxPrice = Math.max(...compared);
        const spreadPct = ((maxPrice - minPrice) / minPrice) * 100;

        return {
          base,
          bithumbKrw,
          okxKrw,
          binanceKrw,
          spreadPct,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => row.spreadPct >= minSpreadFilter)
      .sort((a, b) => b.spreadPct - a.spreadPct)
      .slice(0, 25);
  }, [binanceSpotTickers, binanceFuturesTickers, bithumbSpotTickers, okxSpotTickers, usdtKrwRate, minSpreadFilter, matrixRequireFutures]);

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
            label="OKX Spot vs Perp"
            value={topOkx[0] ? formatPct(topOkx[0].estimatedNetPct) : loading ? "..." : "0.000%"}
            hint="OKX 내부 순수익"
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Fee Settings</h2>
              <p className="mt-1 text-sm text-slate-400">거래소별 taker 수수료를 조정하면 순수익 계산이 즉시 반영됩니다.</p>
            </div>
            <button
              className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              onClick={() => {
                setBinanceFeePct(DEFAULT_BINANCE_TAKER_FEE);
                setBithumbFeePct(DEFAULT_BITHUMB_TAKER_FEE);
                setOkxFeePct(DEFAULT_OKX_TAKER_FEE);
              }}
            >
              기본값으로 복원
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeeInput label="Binance taker" value={binanceFeePct} onChange={setBinanceFeePct} defaultValue={DEFAULT_BINANCE_TAKER_FEE} />
            <FeeInput label="Bithumb taker" value={bithumbFeePct} onChange={setBithumbFeePct} defaultValue={DEFAULT_BITHUMB_TAKER_FEE} />
            <FeeInput label="OKX taker" value={okxFeePct} onChange={setOkxFeePct} defaultValue={DEFAULT_OKX_TAKER_FEE} />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Browser Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">예상 순수익이 {ALERT_THRESHOLD_PCT.toFixed(1)}% 이상인 기회가 나오면 브라우저 알림을 보냅니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
              Permission: {notificationPermission}
            </span>
            <button
              className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                if (!("Notification" in window)) {
                  setNotificationPermission("unsupported");
                  return;
                }
                const permission = await Notification.requestPermission();
                setNotificationPermission(permission);
              }}
              disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}
            >
              알림 권한 요청
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${notificationsEnabled ? "bg-emerald-500 text-white hover:bg-emerald-400" : "border border-white/10 bg-slate-900/80 text-slate-200 hover:bg-slate-800"}`}
              onClick={() => setNotificationsEnabled((prev) => !prev)}
              disabled={notificationPermission !== "granted"}
            >
              {notificationsEnabled ? "알림 켜짐" : "알림 꺼짐"}
            </button>
          </div>
        </section>

        <OpportunitySection
          title="Binance Spot vs Futures"
          description="같은 거래소 내에서 선물이 실제 존재하는 심볼만 대상으로 Spot/Futures 가격 차이를 계산합니다. 출금·슬리피지·펀딩비는 아직 포함하지 않은 참고용 테이블입니다."
          opportunities={topBinance}
          loading={loading}
        />

        <OpportunitySection
          title="OKX Spot vs Perp"
          description="OKX 현물과 OKX 스왑(Perp) 가격 차이를 기준으로 추정 순수익을 계산합니다. 펀딩비와 슬리피지는 아직 포함하지 않은 참고용 테이블입니다."
          opportunities={topOkx}
          loading={loading}
        />

        <OpportunitySection
          title="Bithumb KRW vs OKX Spot"
          description="Bithumb KRW 현물과 OKX 현물을 USDT/KRW 환산 기준으로 비교한 참고용 테이블입니다. 실제 송금/환전/출금 비용은 포함하지 않아 실거래 수익과 다를 수 있습니다."
          opportunities={topCrossExchange}
          loading={loading}
        />

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Exchange × Coin Price Matrix</h2>
              <p className="mt-1 text-sm text-slate-400">Bithumb KRW, OKX Spot, Binance Spot 가격을 KRW 기준으로 비교하는 참고용 가격표입니다. 옵션으로 선물 존재 코인만 보거나 최소 스프레드 이상만 볼 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300">
                <input
                  type="checkbox"
                  checked={matrixRequireFutures}
                  onChange={(event) => setMatrixRequireFutures(event.target.checked)}
                  className="accent-cyan-400"
                />
                Futures 있는 코인만
              </label>
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300">
                최소 스프레드
                <select
                  value={minSpreadFilter}
                  onChange={(event) => setMinSpreadFilter(Number(event.target.value))}
                  className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                >
                  <option value={0}>0%</option>
                  <option value={0.1}>0.1%</option>
                  <option value={0.3}>0.3%</option>
                  <option value={0.5}>0.5%</option>
                  <option value={1}>1.0%</option>
                </select>
              </label>
              <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
                Top 25 spreads
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  {["Coin", "Bithumb (KRW)", "OKX (KRW)", "Binance (KRW)", "Spread %"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/40">
                {priceMatrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {loading ? "시장 데이터를 불러오는 중..." : "비교 가능한 가격 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  priceMatrixRows.map((row) => (
                    <tr key={row.base} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-white">{row.base}</td>
                      <td className="px-4 py-3 text-slate-300">{row.bithumbKrw ? formatPrice(row.bithumbKrw) : "-"}</td>
                      <td className="px-4 py-3 text-slate-300">{row.okxKrw ? formatPrice(row.okxKrw) : "-"}</td>
                      <td className="px-4 py-3 text-slate-300">{row.binanceKrw ? formatPrice(row.binanceKrw) : "-"}</td>
                      <td className={`px-4 py-3 font-semibold ${row.spreadPct > 0.5 ? "text-emerald-400" : "text-slate-300"}`}>{formatPct(row.spreadPct)}</td>
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

function FeeInput({
  label,
  value,
  onChange,
  defaultValue,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  defaultValue: number;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-xs text-slate-500">기본값 {defaultValue.toFixed(3)}%</div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={0.001}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-0"
        />
        <span className="text-xs text-slate-400">%</span>
      </div>
    </label>
  );
}
