"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { calculateArbitrage, calculateCrossExchangeArbitrage } from "@/lib/exchanges";
import { formatNetworkSummary, getMatchedNetworks, summarizeExecutableNetworks } from "@/lib/networks";
import { ArbitrageOpportunity, NormalizedTicker, TransferStatus } from "@/lib/types";

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

type TransferStatusResponse = {
  success: boolean;
  data?: Record<string, TransferStatus>;
  error?: string;
  fetchedAt?: number;
};

type SortDirection = "asc" | "desc";

type OpportunitySortKey = "symbol" | "buyExchange" | "sellExchange" | "buyPrice" | "sellPrice" | "spotPrice" | "futuresPrice" | "gapPct" | "estimatedNetPct";
type MatrixSortKey = "base" | "bithumbKrw" | "okxKrw" | "binanceKrw" | "spreadPct";

type SortConfig<T extends string> = {
  key: T;
  direction: SortDirection;
};

type MatrixRow = {
  base: string;
  bithumbKrw: number | null;
  okxKrw: number | null;
  binanceKrw: number | null;
  spreadPct: number;
};

type ForeignPriceMap = Map<
  string,
  {
    price: number;
    quote: string;
    dexId?: string;
    liquidityUsd?: number;
    tokenAddress?: string;
    sourceUrl?: string;
  }
>;
type TransferStatusMap = Record<string, TransferStatus>;
type WorkflowStep = "idle" | "detected" | "quantity-approved" | "auth-approved" | "executed";
type WorkflowCandidate = {
  id: string;
  symbol: string;
  routeLabel: string;
  buyExchange: string;
  sellExchange: string;
  estimatedNetPct: number;
  gapPct: number;
  buyPrice: number;
  sellPrice: number;
};
type WorkflowMode = "auto" | "manual";
type WorkflowLogEntry = {
  id: string;
  symbol: string;
  routeLabel: string;
  step: WorkflowStep;
  quantity: string;
  updatedAt: number;
};
type NavigationSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
};

const DEFAULT_BINANCE_TAKER_FEE = 0.05;
const DEFAULT_BITHUMB_TAKER_FEE = 0.04;
const DEFAULT_OKX_TAKER_FEE = 0.05;
const POLL_INTERVAL_MS = 3000;
const TRANSFER_STATUS_POLL_MS = 300_000;
const ALERT_THRESHOLD_PCT = 1;

const MIN_VOLUME_OPTIONS = [
  { label: "제한 없음", value: 0 },
  { label: "10만 USDT", value: 100_000 },
  { label: "100만 USDT", value: 1_000_000 },
  { label: "1000만 USDT", value: 10_000_000 },
];

const CROSS_EXCHANGE_COLUMNS: Array<{ key: OpportunitySortKey; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "buyExchange", label: "Buy Exchange" },
  { key: "sellExchange", label: "Sell Exchange" },
  { key: "buyPrice", label: "Buy Price" },
  { key: "sellPrice", label: "Sell Price" },
  { key: "gapPct", label: "Gap %" },
  { key: "estimatedNetPct", label: "Estimated Net %" },
];

const INTERNAL_OPPORTUNITY_COLUMNS = (leftLabel: string, rightLabel: string): Array<{ key: OpportunitySortKey; label: string }> => [
  { key: "symbol", label: "Symbol" },
  { key: "spotPrice", label: leftLabel },
  { key: "futuresPrice", label: rightLabel },
  { key: "gapPct", label: "Gap %" },
  { key: "estimatedNetPct", label: "Estimated Net %" },
];

const MATRIX_COLUMNS: Array<{ key: MatrixSortKey; label: string }> = [
  { key: "base", label: "Coin" },
  { key: "bithumbKrw", label: "Bithumb (KRW)" },
  { key: "okxKrw", label: "OKX (KRW)" },
  { key: "binanceKrw", label: "Binance (KRW)" },
  { key: "spreadPct", label: "Spread %" },
];

const NAVIGATION_SECTIONS: NavigationSection[] = [
  { id: "overview", eyebrow: "Overview", title: "대시보드", description: "요약, 필터, 승인 흐름" },
  { id: "basis", eyebrow: "Perp Basis", title: "현물과 선물 갭", description: "거래소 내부 현선 갭" },
  { id: "cex-cex", eyebrow: "CEX-CEX", title: "현물과 현물 갭", description: "중앙화 거래소 간 비교" },
  { id: "cex-dex", eyebrow: "CEX-DEX", title: "현물과 현물 갭", description: "중앙화 거래소와 DEX 비교" },
  { id: "matrix", eyebrow: "Matrix", title: "가격 매트릭스", description: "전체 시세 스캔" },
];

function opportunityColumnClass(key: OpportunitySortKey) {
  switch (key) {
    case "symbol":
      return "w-[260px]";
    case "buyExchange":
    case "sellExchange":
      return "w-[140px]";
    case "buyPrice":
    case "sellPrice":
    case "spotPrice":
    case "futuresPrice":
      return "w-[210px]";
    case "gapPct":
    case "estimatedNetPct":
      return "w-[140px]";
    default:
      return "";
  }
}

function matrixColumnClass(key: MatrixSortKey) {
  switch (key) {
    case "base":
      return "w-[160px]";
    case "spreadPct":
      return "w-[140px]";
    default:
      return "w-[180px]";
  }
}

function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
}

function nextSortDirection<T extends string>(current: SortConfig<T>, key: T): SortDirection {
  if (current.key !== key) return "asc";
  return current.direction === "desc" ? "asc" : "desc";
}

function sortIndicator<T extends string>(sortConfig: SortConfig<T>, key: T) {
  if (sortConfig.key !== key) return "↕";
  return sortConfig.direction === "desc" ? "↓" : "↑";
}

function compareText(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b);
  return direction === "asc" ? result : -result;
}

function compareNumber(a: number | null, b: number | null, direction: SortDirection) {
  const left = a ?? Number.NEGATIVE_INFINITY;
  const right = b ?? Number.NEGATIVE_INFINITY;
  return direction === "asc" ? left - right : right - left;
}

function getInternalMarketPrices(opportunity: ArbitrageOpportunity) {
  return opportunity.gapPct >= 0
    ? { spotPrice: opportunity.buyPrice, futuresPrice: opportunity.sellPrice }
    : { spotPrice: opportunity.sellPrice, futuresPrice: opportunity.buyPrice };
}

function getCrossMarketPrices(opportunity: ArbitrageOpportunity) {
  return opportunity.buyExchange === "Bithumb Spot"
    ? { krwPrice: opportunity.buyPrice, spotPrice: opportunity.sellPrice }
    : { krwPrice: opportunity.sellPrice, spotPrice: opportunity.buyPrice };
}

function formatOriginalPrice(value: number, quote: string) {
  const formatted = value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return `${formatted} ${quote}`;
}

function formatLiquidityUsd(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatShortAddress(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatTransferAvailability(value: boolean | null, label: string) {
  if (value === null) return `${label} 확인 불가`;
  return `${label} ${value ? "가능" : "불가"}`;
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
    >
      {collapsed ? "펼치기" : "접기"}
    </button>
  );
}

function CategorySection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 shadow-lg shadow-slate-950/20">
      <div className="mb-5 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">{eyebrow}</p>
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="max-w-3xl text-sm text-slate-400">{description}</p>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function SideNavigation({
  activeSection,
  sections,
}: {
  activeSection: string;
  sections: NavigationSection[];
}) {
  return (
    <aside className="top-6 h-fit rounded-[28px] border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur lg:sticky">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">GapGaps</div>
        <div className="mt-2 text-lg font-semibold text-white">Arbitrage Console</div>
        <div className="mt-1 text-xs text-slate-400">좌측 내비게이션으로 큰 카테고리를 바로 이동합니다.</div>
      </div>
      <nav className="mt-4 space-y-2">
        {sections.map((section) => {
          const active = activeSection === section.id;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`block rounded-2xl border px-4 py-3 transition ${
                active
                  ? "border-cyan-400/20 bg-cyan-400/12 text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
              }`}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300/80">{section.eyebrow}</div>
              <div className="mt-1 text-sm font-semibold">{section.title}</div>
              <div className="mt-1 text-xs text-slate-400">{section.description}</div>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

function CollapsedSummary({
  items,
  emptyLabel,
}: {
  items: Array<{ id: string; primary: string; secondary: string; accent?: string }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-500">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
          <div className="truncate text-sm font-medium text-white">{item.primary}</div>
          <div className={`mt-2 text-sm font-mono tabular-nums ${item.accent ?? "text-slate-300"}`}>{item.secondary}</div>
        </div>
      ))}
    </div>
  );
}

function sortOpportunityRows(rows: ArbitrageOpportunity[], sortConfig: SortConfig<OpportunitySortKey>, marketMode: "internal" | "cross" | "krw-cross") {
  return [...rows].sort((a, b) => {
    const leftMarkets = getInternalMarketPrices(a);
    const rightMarkets = getInternalMarketPrices(b);
    const leftCrossMarkets = getCrossMarketPrices(a);
    const rightCrossMarkets = getCrossMarketPrices(b);

    switch (sortConfig.key) {
      case "symbol":
        return compareText(a.symbol, b.symbol, sortConfig.direction);
      case "buyExchange":
        return compareText(a.buyExchange, b.buyExchange, sortConfig.direction);
      case "sellExchange":
        return compareText(a.sellExchange, b.sellExchange, sortConfig.direction);
      case "buyPrice":
        return compareNumber(a.buyPrice, b.buyPrice, sortConfig.direction);
      case "sellPrice":
        return compareNumber(a.sellPrice, b.sellPrice, sortConfig.direction);
      case "spotPrice":
        return compareNumber(
          marketMode === "krw-cross" ? leftCrossMarkets.spotPrice : leftMarkets.spotPrice,
          marketMode === "krw-cross" ? rightCrossMarkets.spotPrice : rightMarkets.spotPrice,
          sortConfig.direction
        );
      case "futuresPrice":
        return compareNumber(
          marketMode === "krw-cross" ? leftCrossMarkets.krwPrice : leftMarkets.futuresPrice,
          marketMode === "krw-cross" ? rightCrossMarkets.krwPrice : rightMarkets.futuresPrice,
          sortConfig.direction
        );
      case "gapPct":
        return compareNumber(a.gapPct, b.gapPct, sortConfig.direction);
      case "estimatedNetPct":
        return compareNumber(a.estimatedNetPct, b.estimatedNetPct, sortConfig.direction);
    }
  });
}

function sortMatrixRows(rows: MatrixRow[], sortConfig: SortConfig<MatrixSortKey>) {
  return [...rows].sort((a, b) => {
    switch (sortConfig.key) {
      case "base":
        return compareText(a.base, b.base, sortConfig.direction);
      case "bithumbKrw":
        return compareNumber(a.bithumbKrw, b.bithumbKrw, sortConfig.direction);
      case "okxKrw":
        return compareNumber(a.okxKrw, b.okxKrw, sortConfig.direction);
      case "binanceKrw":
        return compareNumber(a.binanceKrw, b.binanceKrw, sortConfig.direction);
      case "spreadPct":
        return compareNumber(a.spreadPct, b.spreadPct, sortConfig.direction);
    }
  });
}

function formatStepLabel(step: WorkflowStep) {
  switch (step) {
    case "idle":
      return "대기";
    case "detected":
      return "1단계 감지 완료";
    case "quantity-approved":
      return "2단계 수량 확인 완료";
    case "auth-approved":
      return "3단계 인증 승인 완료";
    case "executed":
      return "4단계 출금 실행 완료";
  }
}

function getWorkflowCandidate(opportunity: ArbitrageOpportunity, routeLabel: string): WorkflowCandidate {
  return {
    id: `${routeLabel}:${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
    symbol: opportunity.symbol,
    routeLabel,
    buyExchange: opportunity.buyExchange,
    sellExchange: opportunity.sellExchange,
    estimatedNetPct: opportunity.estimatedNetPct,
    gapPct: opportunity.gapPct,
    buyPrice: opportunity.buyPrice,
    sellPrice: opportunity.sellPrice,
  };
}

function isTransferReadyForOpportunity(
  opportunity: ArbitrageOpportunity,
  leftStatuses: TransferStatusMap,
  rightStatuses?: TransferStatusMap
) {
  const symbol = opportunity.symbol.replace("/KRW", "");
  const leftStatus = leftStatuses[symbol];
  const rightStatus = rightStatuses?.[symbol];

  if (opportunity.buyExchange === "Bithumb Spot") {
    return leftStatus?.withdrawEnabled === true && rightStatus?.depositEnabled === true;
  }

  return rightStatus?.withdrawEnabled === true && leftStatus?.depositEnabled === true;
}

function getExecutionStatus(
  opportunity: ArbitrageOpportunity,
  leftStatus: TransferStatus | undefined,
  rightStatus?: TransferStatus
) {
  const missingStatus = !leftStatus || !rightStatus;
  if (missingStatus) {
    return { label: "확인 불가", tone: "border-white/10 bg-slate-900/80 text-slate-400" };
  }

  const movingFromLeft = opportunity.buyExchange === "Bithumb Spot";
  const withdrawEnabled = movingFromLeft ? leftStatus.withdrawEnabled : rightStatus.withdrawEnabled;
  const depositEnabled = movingFromLeft ? rightStatus.depositEnabled : leftStatus.depositEnabled;

  if (withdrawEnabled !== true || depositEnabled !== true) {
    return { label: "입출금 불가", tone: "border-rose-400/20 bg-rose-500/10 text-rose-200" };
  }

  const matchedNetworks = getMatchedNetworks(
    movingFromLeft ? leftStatus : rightStatus,
    movingFromLeft ? rightStatus : leftStatus
  );

  if (matchedNetworks.length === 0) {
    return { label: "체인 불일치", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" };
  }

  return { label: "실행 가능", tone: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" };
}

export default function Home() {
  const [binanceSpotTickers, setBinanceSpotTickers] = useState<NormalizedTicker[]>([]);
  const [binanceFuturesTickers, setBinanceFuturesTickers] = useState<NormalizedTicker[]>([]);
  const [bithumbSpotTickers, setBithumbSpotTickers] = useState<NormalizedTicker[]>([]);
  const [okxSpotTickers, setOkxSpotTickers] = useState<NormalizedTicker[]>([]);
  const [okxPerpTickers, setOkxPerpTickers] = useState<NormalizedTicker[]>([]);
  const [solanaDexTickers, setSolanaDexTickers] = useState<NormalizedTicker[]>([]);
  const [usdtKrwRate, setUsdtKrwRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [minSpreadFilter, setMinSpreadFilter] = useState(0.5);
  const [matrixRequireFutures, setMatrixRequireFutures] = useState(true);
  const [binanceFeePct, setBinanceFeePct] = useState(DEFAULT_BINANCE_TAKER_FEE);
  const [bithumbFeePct, setBithumbFeePct] = useState(DEFAULT_BITHUMB_TAKER_FEE);
  const [okxFeePct, setOkxFeePct] = useState(DEFAULT_OKX_TAKER_FEE);
  const [minVolumeUsdt, setMinVolumeUsdt] = useState(0);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const [matrixSortConfig, setMatrixSortConfig] = useState<SortConfig<MatrixSortKey>>({ key: "spreadPct", direction: "asc" });
  const [matrixOrderLock, setMatrixOrderLock] = useState<string[] | null>(null);
  const [bithumbTransferStatus, setBithumbTransferStatus] = useState<TransferStatusMap>({});
  const [binanceTransferStatus, setBinanceTransferStatus] = useState<TransferStatusMap>({});
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("idle");
  const [workflowCandidate, setWorkflowCandidate] = useState<WorkflowCandidate | null>(null);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("auto");
  const [workflowQuantity, setWorkflowQuantity] = useState("");
  const [workflowUpdatedAt, setWorkflowUpdatedAt] = useState<number | null>(null);
  const [workflowLog, setWorkflowLog] = useState<WorkflowLogEntry[]>([]);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);
  const [workflowCollapsed, setWorkflowCollapsed] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const workflowLogSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [binanceSpotRes, binanceFuturesRes, bithumbRes, okxRes, okxPerpRes, solanaDexRes, fxRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/futures"),
          fetch("/api/bithumb/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/okx/perp"),
          fetch("/api/dex/solana"),
          fetch("/api/fx/usdt-krw"),
        ]);

        const [binanceSpotJson, binanceFuturesJson, bithumbJson, okxJson, okxPerpJson, solanaDexJson, fxJson] = (await Promise.all([
          binanceSpotRes.json(),
          binanceFuturesRes.json(),
          bithumbRes.json(),
          okxRes.json(),
          okxPerpRes.json(),
          solanaDexRes.json(),
          fxRes.json(),
        ])) as [ApiResponse, ApiResponse, ApiResponse, ApiResponse, ApiResponse, ApiResponse, FxResponse];

        if (
          !binanceSpotJson.success ||
          !binanceFuturesJson.success ||
          !bithumbJson.success ||
          !okxJson.success ||
          !okxPerpJson.success ||
          !solanaDexJson.success ||
          !fxJson.success ||
          !binanceSpotJson.data ||
          !binanceFuturesJson.data ||
          !bithumbJson.data ||
          !okxJson.data ||
          !okxPerpJson.data ||
          !solanaDexJson.data ||
          !fxJson.data
        ) {
          throw new Error(
            binanceSpotJson.error ||
              binanceFuturesJson.error ||
              bithumbJson.error ||
              okxJson.error ||
              okxPerpJson.error ||
              solanaDexJson.error ||
              fxJson.error ||
              "시세 데이터를 불러오지 못했습니다."
          );
        }

        if (!cancelled) {
          setBinanceSpotTickers(binanceSpotJson.data);
          setBinanceFuturesTickers(binanceFuturesJson.data);
          setBithumbSpotTickers(bithumbJson.data);
          setOkxSpotTickers(okxJson.data);
          setOkxPerpTickers(okxPerpJson.data);
          setSolanaDexTickers(solanaDexJson.data);
          setUsdtKrwRate(fxJson.data.rate);
          setLastUpdated(
            Math.max(
              binanceSpotJson.fetchedAt ?? 0,
              binanceFuturesJson.fetchedAt ?? 0,
              bithumbJson.fetchedAt ?? 0,
              okxJson.fetchedAt ?? 0,
              okxPerpJson.fetchedAt ?? 0,
              solanaDexJson.fetchedAt ?? 0,
              fxJson.fetchedAt ?? 0
            )
          );
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
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

  useEffect(() => {
    let cancelled = false;

    const fetchTransferStatus = async () => {
      const [bithumbStatusResult, binanceStatusResult] = await Promise.allSettled([
        fetch("/api/bithumb/status"),
        fetch("/api/binance/status"),
      ]);

      if (cancelled) return;

      if (bithumbStatusResult.status === "fulfilled") {
        const json = (await bithumbStatusResult.value.json()) as TransferStatusResponse;
        if (json.success && json.data) {
          setBithumbTransferStatus(json.data);
        }
      }

      if (binanceStatusResult.status === "fulfilled") {
        const json = (await binanceStatusResult.value.json()) as TransferStatusResponse;
        if (json.success && json.data) {
          setBinanceTransferStatus(json.data);
        }
      }
    };

    void fetchTransferStatus();
    const interval = setInterval(() => {
      void fetchTransferStatus();
    }, TRANSFER_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setCountdown(POLL_INTERVAL_MS / 1000);
  }, [lastUpdated]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const binanceInternalOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(binanceSpotTickers, binanceFuturesTickers, binanceFeePct);
  }, [binanceSpotTickers, binanceFuturesTickers, binanceFeePct]);

  const bithumbOkxOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : bithumbSpotTickers;
    const filteredOkx =
      minVolumeUsdt > 0 ? okxSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt) : okxSpotTickers;

    return calculateCrossExchangeArbitrage(filteredBithumb, filteredOkx, {
      leftFeePct: bithumbFeePct,
      rightFeePct: okxFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "OKX Spot",
    });
  }, [bithumbSpotTickers, okxSpotTickers, usdtKrwRate, bithumbFeePct, okxFeePct, minVolumeUsdt]);

  const bithumbBinanceOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : bithumbSpotTickers;
    const filteredBinance =
      minVolumeUsdt > 0
        ? binanceSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : binanceSpotTickers;

    return calculateCrossExchangeArbitrage(filteredBithumb, filteredBinance, {
      leftFeePct: bithumbFeePct,
      rightFeePct: binanceFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "Binance Spot",
    });
  }, [bithumbSpotTickers, binanceSpotTickers, usdtKrwRate, bithumbFeePct, binanceFeePct, minVolumeUsdt]);

  const bithumbSolanaDexOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : bithumbSpotTickers;

    return calculateCrossExchangeArbitrage(filteredBithumb, solanaDexTickers, {
      leftFeePct: bithumbFeePct,
      rightFeePct: 0.3,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "Solana DEX",
    });
  }, [bithumbSpotTickers, solanaDexTickers, usdtKrwRate, bithumbFeePct, minVolumeUsdt]);

  const okxInternalOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(okxSpotTickers, okxPerpTickers, okxFeePct);
  }, [okxSpotTickers, okxPerpTickers, okxFeePct]);

  const topBinance = binanceInternalOpportunities.slice(0, 15);
  const topOkx = okxInternalOpportunities.slice(0, 15);
  const topCrossExchange = bithumbOkxOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topBithumbBinance = bithumbBinanceOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topBithumbSolanaDex = bithumbSolanaDexOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);

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
    if (sessionStorage.getItem(notificationId)) return;

    sessionStorage.setItem(notificationId, "1");
    new Notification("GapGaps Opportunity", {
      body: `${top.symbol} ${top.buyExchange} -> ${top.sellExchange} | 예상 순수익 ${top.estimatedNetPct.toFixed(3)}%`,
    });
  }, [notificationsEnabled, notificationPermission, topCrossExchange]);

  const priceMatrixRows = useMemo(() => {
    if (!usdtKrwRate) return [];

    const binanceMap = new Map(binanceSpotTickers.map((ticker) => [ticker.base, ticker]));
    const binanceFuturesBaseSet = new Set(binanceFuturesTickers.map((ticker) => ticker.base));
    const bithumbMap = new Map(bithumbSpotTickers.map((ticker) => [ticker.base, ticker]));
    const okxMap = new Map(okxSpotTickers.map((ticker) => [ticker.base, ticker]));

    const bases = Array.from(new Set([...Array.from(bithumbMap.keys()), ...Array.from(okxMap.keys()), ...Array.from(binanceMap.keys())])).sort();

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

        return {
          base,
          bithumbKrw,
          okxKrw,
          binanceKrw,
          spreadPct: ((maxPrice - minPrice) / minPrice) * 100,
        };
      })
      .filter((row): row is MatrixRow => row !== null)
      .filter((row) => row.spreadPct >= minSpreadFilter)
      .sort((a, b) => b.spreadPct - a.spreadPct)
      .slice(0, 25);
  }, [binanceSpotTickers, binanceFuturesTickers, bithumbSpotTickers, okxSpotTickers, usdtKrwRate, minSpreadFilter, matrixRequireFutures]);

  const sortedPriceMatrixRows = useMemo(() => {
    if (!matrixOrderLock) {
      return sortMatrixRows(priceMatrixRows, matrixSortConfig);
    }

    const orderIndex = new Map(matrixOrderLock.map((key, index) => [key, index]));
    return [...priceMatrixRows].sort((a, b) => {
      const leftIndex = orderIndex.get(a.base);
      const rightIndex = orderIndex.get(b.base);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return compareText(a.base, b.base, "asc");
    });
  }, [matrixOrderLock, priceMatrixRows, matrixSortConfig]);

  useEffect(() => {
    if (matrixOrderLock || priceMatrixRows.length === 0) return;
    setMatrixOrderLock(sortMatrixRows(priceMatrixRows, matrixSortConfig).map((row) => row.base));
  }, [matrixOrderLock, matrixSortConfig, priceMatrixRows]);

  const okxSpotPriceMap = useMemo<ForeignPriceMap>(() => {
    return new Map(okxSpotTickers.map((ticker) => [ticker.base, { price: ticker.price, quote: ticker.quote }]));
  }, [okxSpotTickers]);

  const binanceSpotPriceMap = useMemo<ForeignPriceMap>(() => {
    return new Map(binanceSpotTickers.map((ticker) => [ticker.base, { price: ticker.price, quote: ticker.quote }]));
  }, [binanceSpotTickers]);

  const solanaDexPriceMap = useMemo<ForeignPriceMap>(() => {
    return new Map(
      solanaDexTickers.map((ticker) => [
        ticker.base,
        {
          price: ticker.price,
          quote: "USD",
          dexId: ticker.metadata?.dexId,
          liquidityUsd: ticker.metadata?.liquidityUsd,
          tokenAddress: ticker.metadata?.tokenAddress,
          sourceUrl: ticker.metadata?.sourceUrl,
        },
      ])
    );
  }, [solanaDexTickers]);

  const solanaDexTransferStatus = useMemo<TransferStatusMap>(() => {
    return solanaDexTickers.reduce<TransferStatusMap>((acc, ticker) => {
      acc[ticker.base] = {
        depositEnabled: true,
        withdrawEnabled: true,
        networks: [
          {
            networkKey: "SOL",
            networkLabel: "SOL",
            normalizedNetwork: "solana",
            depositEnabled: true,
            withdrawEnabled: true,
          },
        ],
      };
      return acc;
    }, {});
  }, [solanaDexTickers]);

  const workflowTopCandidate = useMemo<WorkflowCandidate | null>(() => {
    const bestBinanceOpportunity = topBithumbBinance.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, binanceTransferStatus)
    );
    const bestOkxOpportunity = topCrossExchange.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus)
    );
    const bestBinance = bestBinanceOpportunity ? getWorkflowCandidate(bestBinanceOpportunity, "Bithumb -> Binance") : null;
    const bestOkx = bestOkxOpportunity ? getWorkflowCandidate(bestOkxOpportunity, "Bithumb -> OKX") : null;
    if (!bestBinance) return bestOkx;
    if (!bestOkx) return bestBinance;
    return bestBinance.estimatedNetPct >= bestOkx.estimatedNetPct ? bestBinance : bestOkx;
  }, [bithumbTransferStatus, binanceTransferStatus, topBithumbBinance, topCrossExchange]);

  const workflowNetworkState = useMemo(() => {
    if (!workflowCandidate) return null;

    const symbol = workflowCandidate.symbol.replace("/KRW", "");
    const bithumb = bithumbTransferStatus[symbol];
    const binance = binanceTransferStatus[symbol];
    const counterpartLabel = workflowCandidate.routeLabel.includes("Binance") ? "바이낸스" : workflowCandidate.routeLabel.includes("OKX") ? "OKX" : "상대 거래소";
    const counterpartStatus = workflowCandidate.routeLabel.includes("Binance") ? binance : undefined;
    const matchedNetworks = getMatchedNetworks(bithumb, counterpartStatus);

    return {
      symbol,
      counterpartLabel,
      bithumb,
      counterpartStatus,
      matchedNetworks,
    };
  }, [bithumbTransferStatus, binanceTransferStatus, workflowCandidate]);

  useEffect(() => {
    if (!workflowTopCandidate || workflowTopCandidate.estimatedNetPct < ALERT_THRESHOLD_PCT) return;
    if (workflowMode !== "auto") return;

    setWorkflowCandidate((current) => {
      if (current?.id === workflowTopCandidate.id) return current;
      return workflowTopCandidate;
    });
    setWorkflowStep((current) => (current === "idle" ? "detected" : current));
    setWorkflowUpdatedAt(Date.now());
  }, [workflowMode, workflowTopCandidate]);

  useEffect(() => {
    if (!workflowCandidate || !workflowUpdatedAt) return;
    const signature = `${workflowCandidate.id}:${workflowStep}:${workflowQuantity}:${workflowUpdatedAt}`;
    if (workflowLogSignatureRef.current === signature) return;
    workflowLogSignatureRef.current = signature;

    setWorkflowLog((current) => [
      {
        id: workflowCandidate.id,
        symbol: workflowCandidate.symbol,
        routeLabel: workflowCandidate.routeLabel,
        step: workflowStep,
        quantity: workflowQuantity,
        updatedAt: workflowUpdatedAt,
      },
      ...current,
    ].slice(0, 30));
  }, [workflowCandidate, workflowQuantity, workflowStep, workflowUpdatedAt]);

  useEffect(() => {
    const observers = NAVIGATION_SECTIONS.map((section) => {
      const element = document.getElementById(section.id);
      if (!element) return null;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setActiveSection(section.id);
          }
        },
        { rootMargin: "-25% 0px -55% 0px", threshold: 0.1 }
      );

      observer.observe(element);
      return observer;
    });

    return () => {
      observers.forEach((observer) => observer?.disconnect());
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <SideNavigation activeSection={activeSection} sections={NAVIGATION_SECTIONS} />
          <div className="space-y-8">
        <header id="overview" className="scroll-mt-24 flex flex-col gap-4 rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">GapGaps</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Crypto Arbitrage Monitor</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                바이낸스 현물과 선물, 빗썸 KRW 마켓, OKX 현물과 무기한 선물 시세를 3초마다 불러와 거래소 간 가격 차이를 빠르게 비교하는
                실시간 대시보드입니다.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              <div>{lastUpdated ? `마지막 업데이트: ${new Date(lastUpdated).toLocaleTimeString()}` : "데이터를 불러오는 중..."}</div>
              <div className="mt-1 text-xs text-cyan-200/80">USDT/KRW: {usdtKrwRate ? formatPrice(usdtKrwRate) : "-"}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-cyan-300/70">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                다음 갱신까지 {countdown}초
              </div>
            </div>
          </div>
          {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">오류: {error}</div>}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Binance Spot" value={binanceSpotTickers.length.toLocaleString()} hint="USDT 마켓 기준" />
          <SummaryCard label="Bithumb KRW" value={bithumbSpotTickers.length.toLocaleString()} hint="원화 마켓 종목 수" />
          <SummaryCard label="OKX Spot" value={okxSpotTickers.length.toLocaleString()} hint="USDT 기준 비교 대상" />
          <SummaryCard
            label="Best Cross-Exchange"
            value={
              topBithumbBinance[0]
                ? formatPct(topBithumbBinance[0].estimatedNetPct)
                : topCrossExchange[0]
                  ? formatPct(topCrossExchange[0].estimatedNetPct)
                  : loading
                    ? "..."
                    : "0.000%"
            }
            hint={
              topBithumbBinance[0]
                ? `${topBithumbBinance[0].symbol} (Bithumb <-> Binance)`
                : topCrossExchange[0]
                  ? `${topCrossExchange[0].symbol} (Bithumb <-> OKX)`
                  : "크로스 거래소 기준 최고 순수익"
            }
          />
        </section>

        <section className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5 text-sm text-amber-50">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-amber-100">KRW 비교 기준</h2>
              <p className="mt-1 text-amber-50/90">
                KRW 거래소와 해외 spot 비교는 항상 KRW 기준으로 계산합니다. 해외 가격은 `USDT/KRW` 환율을 적용한 값이며, 표에는 `KRW 환산값 (해외 원가)`
                형식으로 함께 표시됩니다.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200/20 bg-slate-950/30 px-4 py-3 text-xs text-amber-100">
              <div>현재 환산 기준</div>
              <div className="mt-1 text-lg font-semibold">{usdtKrwRate ? `1 USDT = ${formatPrice(usdtKrwRate)} KRW` : "환율 로딩 중"}</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Fee &amp; Filter Settings</h2>
              <p className="mt-1 text-sm text-slate-400">거래소별 taker 수수료와 최소 거래대금 필터를 조정하면 기회 목록이 즉시 다시 계산됩니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  setBinanceFeePct(DEFAULT_BINANCE_TAKER_FEE);
                  setBithumbFeePct(DEFAULT_BITHUMB_TAKER_FEE);
                  setOkxFeePct(DEFAULT_OKX_TAKER_FEE);
                  setMinVolumeUsdt(0);
                }}
              >
                기본값으로 복원
              </button>
              <CollapseButton collapsed={settingsCollapsed} onClick={() => setSettingsCollapsed((prev) => !prev)} />
            </div>
          </div>

          {!settingsCollapsed ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <FeeInput label="Binance taker" value={binanceFeePct} onChange={setBinanceFeePct} defaultValue={DEFAULT_BINANCE_TAKER_FEE} />
                <FeeInput label="Bithumb taker" value={bithumbFeePct} onChange={setBithumbFeePct} defaultValue={DEFAULT_BITHUMB_TAKER_FEE} />
                <FeeInput label="OKX taker" value={okxFeePct} onChange={setOkxFeePct} defaultValue={DEFAULT_OKX_TAKER_FEE} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-slate-400">최소 24시간 거래대금(크로스 거래소)</span>
                <select
                  value={minVolumeUsdt}
                  onChange={(event) => setMinVolumeUsdt(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none"
                >
                  {MIN_VOLUME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">빗썸 KRW 거래대금은 현재 USDT/KRW 환율로 환산합니다.</span>
              </div>
            </>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Browser Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">호가 기준 예상 순수익이 {ALERT_THRESHOLD_PCT.toFixed(1)}% 이상인 기회가 보이면 브라우저 알림을 보냅니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!alertsCollapsed ? (
              <>
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
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    notificationsEnabled ? "bg-emerald-500 text-white hover:bg-emerald-400" : "border border-white/10 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
                  }`}
                  onClick={() => setNotificationsEnabled((prev) => !prev)}
                  disabled={notificationPermission !== "granted"}
                >
                  {notificationsEnabled ? "알림 켜짐" : "알림 꺼짐"}
                </button>
              </>
            ) : null}
            <CollapseButton collapsed={alertsCollapsed} onClick={() => setAlertsCollapsed((prev) => !prev)} />
          </div>
        </section>

        <WithdrawalWorkflowSection
          candidate={workflowCandidate}
          networkState={workflowNetworkState}
          logEntries={workflowLog}
          mode={workflowMode}
          step={workflowStep}
          quantity={workflowQuantity}
          lastUpdated={workflowUpdatedAt}
          collapsed={workflowCollapsed}
          onToggleCollapsed={() => setWorkflowCollapsed((prev) => !prev)}
          onQuantityChange={setWorkflowQuantity}
          onApproveQuantity={() => {
            setWorkflowStep("quantity-approved");
            setWorkflowUpdatedAt(Date.now());
          }}
          onApproveAuth={() => {
            setWorkflowStep("auth-approved");
            setWorkflowUpdatedAt(Date.now());
          }}
          onExecute={() => {
            setWorkflowStep("executed");
            setWorkflowUpdatedAt(Date.now());
          }}
          onReset={() => {
            setWorkflowMode("auto");
            setWorkflowStep(workflowTopCandidate ? "detected" : "idle");
            setWorkflowCandidate(workflowTopCandidate);
            setWorkflowQuantity("");
            setWorkflowUpdatedAt(Date.now());
          }}
        />

        <CategorySection
          id="basis"
          eyebrow="Perp Basis"
          title="현물과 선물 갭 (현선갭)"
          description="같은 거래소 안에서 현물과 선물 가격이 얼마나 벌어지는지 보는 영역입니다. 내부 베이시스 확인과 헷지 아이디어 검토에 적합합니다."
        >
          <OpportunitySection
            title="Binance Spot vs Futures"
            description="같은 코인의 현물과 선물 가격 차이를 기준으로 내부 괴리를 정리합니다. 출금비, 슬리피지, 펀딩비는 포함하지 않은 참고용 지표입니다."
            opportunities={topBinance}
            loading={loading}
            marketMode="internal"
            leftMarketLabel="Spot Price"
            rightMarketLabel="Futures Price"
          />

          <OpportunitySection
            title="OKX Spot vs Perp"
            description="OKX 현물과 무기한 선물 가격 차이를 기준으로 예상 순수익을 계산합니다. 실제 거래 전에는 수수료와 펀딩비를 함께 확인해야 합니다."
            opportunities={topOkx}
            loading={loading}
            marketMode="internal"
            leftMarketLabel="Spot Price"
            rightMarketLabel="Perp Price"
          />
        </CategorySection>

        <CategorySection
          id="cex-cex"
          eyebrow="CEX-CEX"
          title="현물과 현물 갭 (CEX-CEX)"
          description="중앙화 거래소끼리의 현물 가격 차이를 비교하는 영역입니다. 환율 반영, 입출금 상태, 네트워크 일치 여부를 함께 보면서 실제 이동 가능한 후보를 찾습니다."
        >
          <OpportunitySection
            title="Bithumb KRW vs OKX Spot"
            description="빗썸 원화 마켓과 OKX 현물 가격을 USDT/KRW 환율로 맞춰 비교합니다. 실제 송금, 환전, 출금 비용은 별도로 반영해야 합니다."
            opportunities={topCrossExchange}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={okxSpotPriceMap}
            workflowCandidateId={workflowCandidate?.id ?? null}
            onPromoteToWorkflow={(opportunity) => {
              setWorkflowMode("manual");
              setWorkflowCandidate(getWorkflowCandidate(opportunity, "Bithumb -> OKX"));
              setWorkflowStep("detected");
              setWorkflowQuantity("");
              setWorkflowUpdatedAt(Date.now());
            }}
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "OKX",
            }}
          />

          <OpportunitySection
            title="Bithumb KRW vs Binance Spot"
            description="빗썸 원화 마켓과 바이낸스 USDT 마켓을 같은 KRW 기준으로 비교합니다. 김치 프리미엄 방향과 크기를 빠르게 확인할 때 유용합니다."
            opportunities={topBithumbBinance}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={binanceSpotPriceMap}
            workflowCandidateId={workflowCandidate?.id ?? null}
            onPromoteToWorkflow={(opportunity) => {
              setWorkflowMode("manual");
              setWorkflowCandidate(getWorkflowCandidate(opportunity, "Bithumb -> Binance"));
              setWorkflowStep("detected");
              setWorkflowQuantity("");
              setWorkflowUpdatedAt(Date.now());
            }}
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "바이낸스",
              rightStatuses: binanceTransferStatus,
            }}
          />
        </CategorySection>

        <CategorySection
          id="cex-dex"
          eyebrow="CEX-DEX"
          title="현물과 현물 갭 (CEX-DEX)"
          description="중앙화 거래소 현물과 DEX 현물 가격을 비교하는 영역입니다. 체인 호환성과 입출금 상태를 먼저 보고, 그 다음 가격 차이를 해석하는 흐름에 맞췄습니다."
        >
          <OpportunitySection
            title="Bithumb KRW vs Solana DEX"
            description="빗썸에서 Solana 네트워크를 지원하는 코인 중, Jupiter에서 검증된 민트 주소가 하나로 확인되는 토큰만 Solana DEX와 비교합니다."
            opportunities={topBithumbSolanaDex}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="DEX Price"
            foreignPriceMap={solanaDexPriceMap}
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "Solana DEX",
              rightStatuses: solanaDexTransferStatus,
            }}
          />
        </CategorySection>

        <section id="matrix" className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Exchange Coin Price Matrix</h2>
              <p className="mt-1 text-sm text-slate-400">
                빗썸 KRW, OKX Spot, Binance Spot 가격을 모두 KRW 기준으로 비교합니다. 선물 종목이 있는 코인만 보거나 최소 스프레드 이상만
                필터링해서 볼 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!matrixCollapsed ? (
                <>
                  <label className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={matrixRequireFutures}
                      onChange={(event) => setMatrixRequireFutures(event.target.checked)}
                      className="accent-cyan-400"
                    />
                    선물 종목만 보기
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
                  <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">Top 25 spreads</span>
                </>
              ) : null}
              <CollapseButton collapsed={matrixCollapsed} onClick={() => setMatrixCollapsed((prev) => !prev)} />
            </div>
          </div>

          {!matrixCollapsed ? (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full table-fixed divide-y divide-white/10 text-sm">
                <thead className="bg-slate-900/70 text-slate-300">
                  <tr>
                    {MATRIX_COLUMNS.map((column) => (
                      <th key={column.key} className={`px-4 py-3 text-left font-medium ${matrixColumnClass(column.key)}`}>
                        <button
                          type="button"
                          onClick={() =>
                            setMatrixSortConfig((current) => {
                              const nextConfig = { key: column.key, direction: nextSortDirection(current, column.key) } satisfies SortConfig<MatrixSortKey>;
                              setMatrixOrderLock(sortMatrixRows(priceMatrixRows, nextConfig).map((row) => row.base));
                              return nextConfig;
                            })
                          }
                          className="inline-flex items-center gap-2 text-left transition hover:text-white"
                        >
                          <span>{column.label}</span>
                          <span className="text-xs text-slate-500">{sortIndicator(matrixSortConfig, column.key)}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/40">
                  {sortedPriceMatrixRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        {loading ? "시세 데이터를 불러오는 중..." : "비교 가능한 가격 데이터가 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    sortedPriceMatrixRows.map((row) => (
                      <tr key={row.base} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-medium text-white">{row.base}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.bithumbKrw ? formatPrice(row.bithumbKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.okxKrw ? formatPrice(row.okxKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.binanceKrw ? formatPrice(row.binanceKrw) : "-"}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${row.spreadPct > 0.5 ? "text-emerald-400" : "text-slate-300"}`}>{formatPct(row.spreadPct)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <CollapsedSummary
              items={sortedPriceMatrixRows.slice(0, 3).map((row) => ({
                id: row.base,
                primary: row.base,
                secondary: `Spread ${formatPct(row.spreadPct)}`,
                accent: row.spreadPct > 0.5 ? "text-emerald-300" : "text-slate-300",
              }))}
              emptyLabel="요약할 가격 비교 데이터가 없습니다."
            />
          )}
        </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function OpportunitySection({
  title,
  description,
  opportunities,
  loading,
  marketMode = "cross",
  leftMarketLabel = "Spot Price",
  rightMarketLabel = "Futures Price",
  foreignPriceMap,
  workflowCandidateId,
  onPromoteToWorkflow,
  transferStatusConfig,
}: {
  title: string;
  description: string;
  opportunities: ArbitrageOpportunity[];
  loading: boolean;
  marketMode?: "internal" | "cross" | "krw-cross";
  leftMarketLabel?: string;
  rightMarketLabel?: string;
  foreignPriceMap?: ForeignPriceMap;
  workflowCandidateId?: string | null;
  onPromoteToWorkflow?: (opportunity: ArbitrageOpportunity) => void;
  transferStatusConfig?: {
    leftExchangeLabel: string;
    leftStatuses: TransferStatusMap;
    rightExchangeLabel: string;
    rightStatuses?: TransferStatusMap;
  };
}) {
  const [sortConfig, setSortConfig] = useState<SortConfig<OpportunitySortKey>>({ key: "estimatedNetPct", direction: "asc" });
  const [orderLock, setOrderLock] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const columns = marketMode === "cross" ? CROSS_EXCHANGE_COLUMNS : INTERNAL_OPPORTUNITY_COLUMNS(leftMarketLabel, rightMarketLabel);
  const hasTransferStatus = Boolean(transferStatusConfig);
  const colSpan = marketMode === "cross" ? 7 : 5;

  const sortedOpportunities = useMemo(() => {
    if (!orderLock) {
      return sortOpportunityRows(opportunities, sortConfig, marketMode);
    }

    const orderIndex = new Map(orderLock.map((key, index) => [key, index]));
    return [...opportunities].sort((a, b) => {
      const leftKey = `${a.symbol}:${a.buyExchange}:${a.sellExchange}`;
      const rightKey = `${b.symbol}:${b.buyExchange}:${b.sellExchange}`;
      const leftIndex = orderIndex.get(leftKey);
      const rightIndex = orderIndex.get(rightKey);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return compareText(leftKey, rightKey, "asc");
    });
  }, [marketMode, opportunities, orderLock, sortConfig]);

  useEffect(() => {
    if (orderLock || opportunities.length === 0) return;
    setOrderLock(sortOpportunityRows(opportunities, sortConfig, marketMode).map((item) => `${item.symbol}:${item.buyExchange}:${item.sellExchange}`));
  }, [marketMode, opportunities, orderLock, sortConfig]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">Polling every {POLL_INTERVAL_MS / 1000}s</span>
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((prev) => !prev)} />
        </div>
      </div>

      {!collapsed ? (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full table-fixed divide-y divide-white/10 text-sm">
            <thead className="bg-slate-900/70 text-slate-300">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 text-left font-medium ${opportunityColumnClass(column.key)}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setSortConfig((current) => {
                          const nextConfig = { key: column.key, direction: nextSortDirection(current, column.key) } satisfies SortConfig<OpportunitySortKey>;
                          setOrderLock(
                            sortOpportunityRows(opportunities, nextConfig, marketMode).map(
                              (item) => `${item.symbol}:${item.buyExchange}:${item.sellExchange}`
                            )
                          );
                          return nextConfig;
                        })
                      }
                      className="inline-flex items-center gap-2 text-left transition hover:text-white"
                    >
                      <span>{column.label}</span>
                      <span className="text-xs text-slate-500">{sortIndicator(sortConfig, column.key)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40">
              {sortedOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">
                    {loading ? "시세 데이터를 불러오는 중..." : "현재 조건에 맞는 차익거래 기회가 없습니다."}
                  </td>
                </tr>
              ) : (
                sortedOpportunities.map((opportunity) => {
                const { spotPrice, futuresPrice } = getInternalMarketPrices(opportunity);
                const { krwPrice, spotPrice: foreignSpotKrwPrice } = getCrossMarketPrices(opportunity);
                const foreignPrice = foreignPriceMap?.get(opportunity.symbol.replace("/KRW", ""));
                const transferSymbol = opportunity.symbol.replace("/KRW", "");
                const leftTransferStatus = transferStatusConfig?.leftStatuses[transferSymbol];
                const rightTransferStatus = transferStatusConfig?.rightStatuses?.[transferSymbol];
                const leftNetworkSummary = formatNetworkSummary(summarizeExecutableNetworks(leftTransferStatus));
                const rightNetworkSummary = formatNetworkSummary(summarizeExecutableNetworks(rightTransferStatus));
                const executionStatus = hasTransferStatus ? getExecutionStatus(opportunity, leftTransferStatus, rightTransferStatus) : null;
                const routeLabel =
                  title === "Bithumb KRW vs Binance Spot"
                    ? "Bithumb -> Binance"
                    : title === "Bithumb KRW vs OKX Spot"
                      ? "Bithumb -> OKX"
                      : title;
                const candidateId = getWorkflowCandidate(opportunity, routeLabel).id;
                const isWorkflowSelected = workflowCandidateId === candidateId;
                const renderCrossExchangePrice = (exchangeLabel: string, krwPrice: number) => {
                  const isForeignExchange = exchangeLabel !== "Bithumb Spot" && Boolean(foreignPrice);
                  if (!isForeignExchange || !foreignPrice) return formatPrice(krwPrice);

                  return `${formatPrice(krwPrice)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})`;
                };
                return (
                  <tr key={`${title}-${opportunity.symbol}-${opportunity.buyExchange}-${opportunity.sellExchange}`} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">
                      <div className="flex flex-col gap-2">
                        <span>{opportunity.symbol}</span>
                        {hasTransferStatus ? (
                          <div className="flex flex-col gap-1 text-xs text-slate-300">
                            <TransferStatusLine
                              exchangeLabel={transferStatusConfig?.leftExchangeLabel ?? ""}
                              status={leftTransferStatus}
                            />
                            <TransferStatusLine
                              exchangeLabel={transferStatusConfig?.rightExchangeLabel ?? ""}
                              status={rightTransferStatus}
                            />
                            {onPromoteToWorkflow ? (
                              <button
                                type="button"
                                onClick={() => onPromoteToWorkflow(opportunity)}
                                className={`mt-1 inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                  isWorkflowSelected
                                    ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                                    : "border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                                }`}
                              >
                                {isWorkflowSelected ? "현재 승인 후보" : "이 후보로 진행"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {marketMode === "internal" ? (
                      <>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(spotPrice)}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatPrice(futuresPrice)}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-medium ${opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{formatPct(opportunity.gapPct)}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                          {formatPct(opportunity.estimatedNetPct)}
                        </td>
                      </>
                    ) : marketMode === "krw-cross" ? (
                      <>
                        <td className="px-4 py-3 text-slate-300">
                          <div className="font-mono tabular-nums">{formatPrice(krwPrice)}</div>
                          {hasTransferStatus ? (
                            <>
                              <div className="mt-1 text-[11px] text-slate-500">{transferStatusConfig?.leftExchangeLabel} 네트워크: {leftNetworkSummary}</div>
                              {executionStatus ? <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${executionStatus.tone}`}>{executionStatus.label}</div> : null}
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <div className="font-mono tabular-nums">
                            {foreignPrice ? `${formatPrice(foreignSpotKrwPrice)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})` : formatPrice(foreignSpotKrwPrice)}
                          </div>
                          {hasTransferStatus ? <div className="mt-1 text-[11px] text-slate-500">{transferStatusConfig?.rightExchangeLabel} 네트워크: {rightNetworkSummary}</div> : null}
                          {foreignPrice?.dexId ? (
                            <div className="mt-1 text-[11px] text-slate-500">
                              DEX: {foreignPrice.dexId}
                              {formatLiquidityUsd(foreignPrice.liquidityUsd) ? ` · 유동성 ${formatLiquidityUsd(foreignPrice.liquidityUsd)}` : ""}
                            </div>
                          ) : null}
                          {foreignPrice?.tokenAddress ? (
                            <div className="mt-1 text-[11px] text-slate-500">민트: {formatShortAddress(foreignPrice.tokenAddress)}</div>
                          ) : null}
                        </td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-medium ${opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{formatPct(opportunity.gapPct)}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                          {formatPct(opportunity.estimatedNetPct)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-slate-300">{opportunity.buyExchange}</td>
                        <td className="px-4 py-3 text-slate-300">{opportunity.sellExchange}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{renderCrossExchangePrice(opportunity.buyExchange, opportunity.buyPrice)}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{renderCrossExchangePrice(opportunity.sellExchange, opportunity.sellPrice)}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-medium ${opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{formatPct(opportunity.gapPct)}</td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                          {formatPct(opportunity.estimatedNetPct)}
                        </td>
                      </>
                    )}
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <CollapsedSummary
          items={sortedOpportunities.slice(0, 3).map((opportunity) => ({
            id: `${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
            primary: opportunity.symbol,
            secondary:
              marketMode === "internal"
                ? `${leftMarketLabel} / ${rightMarketLabel} ${formatPct(opportunity.gapPct)}`
                : `${opportunity.buyExchange} -> ${opportunity.sellExchange} ${formatPct(opportunity.estimatedNetPct)}`,
            accent: opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300",
          }))}
          emptyLabel={loading ? "시세 데이터를 불러오는 중..." : "요약할 차익거래 기회가 없습니다."}
        />
      )}
    </section>
  );
}

function TransferStatusLine({ exchangeLabel, status }: { exchangeLabel: string; status?: TransferStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium text-slate-200">{exchangeLabel}</span>
      <TransferStatusBadge enabled={status?.depositEnabled ?? null} label="입금" />
      <TransferStatusBadge enabled={status?.withdrawEnabled ?? null} label="출금" />
    </div>
  );
}

function TransferStatusBadge({ enabled, label }: { enabled: boolean | null; label: string }) {
  const className =
    enabled === null
      ? "border-white/10 bg-slate-900/80 text-slate-400"
      : enabled
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        : "border-rose-400/20 bg-rose-500/10 text-rose-200";

  return <span className={`rounded-full border px-2 py-1 text-[11px] ${className}`}>{formatTransferAvailability(enabled, label)}</span>;
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

function WithdrawalWorkflowSection({
  candidate,
  networkState,
  logEntries,
  mode,
  step,
  quantity,
  lastUpdated,
  collapsed,
  onToggleCollapsed,
  onQuantityChange,
  onApproveQuantity,
  onApproveAuth,
  onExecute,
  onReset,
}: {
  candidate: WorkflowCandidate | null;
  networkState: {
    symbol: string;
    counterpartLabel: string;
    bithumb?: TransferStatus;
    counterpartStatus?: TransferStatus;
    matchedNetworks: ReturnType<typeof getMatchedNetworks>;
  } | null;
  logEntries: WorkflowLogEntry[];
  mode: WorkflowMode;
  step: WorkflowStep;
  quantity: string;
  lastUpdated: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onQuantityChange: (value: string) => void;
  onApproveQuantity: () => void;
  onApproveAuth: () => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  const quantityReady = quantity.trim().length > 0 && Number(quantity) > 0;
  const canApproveQuantity = step === "detected" && quantityReady;
  const canApproveAuth = step === "quantity-approved";
  const canExecute = step === "auth-approved";

  return (
    <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Withdrawal Flow</p>
          <h2 className="mt-2 text-xl font-semibold text-white">단계별 출금 승인</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">
            자동 감지 후 바로 출금하지 않고, 수량 확인과 인증 승인을 각각 거친 뒤 마지막에만 출금이 열리도록 구성했습니다. 현재는 실출금 API 대신 승인 흐름을 검증하는 안전한 모드입니다.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
          <div>현재 단계</div>
          <div className="mt-1 text-base font-semibold text-white">{formatStepLabel(step)}</div>
          <div className="mt-1 text-slate-400">후보 선택: {mode === "auto" ? "자동 감지" : "수동 선택"}</div>
          <div className="mt-1 text-slate-500">{lastUpdated ? `업데이트 ${new Date(lastUpdated).toLocaleTimeString()}` : "대기 중"}</div>
        </div>
        <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed} />
      </div>

      {!collapsed ? <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <ExecutionBoard candidate={candidate} logEntries={logEntries} />

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">감지된 후보</h3>
              <p className="mt-1 text-sm text-slate-400">자동 감지 후보를 기본으로 쓰되, 아래 표에서 원하는 기회를 직접 선택해서 승인 흐름에 올릴 수 있습니다.</p>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              후보 다시 불러오기
            </button>
          </div>

          {!candidate ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
              아직 자동 감지된 출금 후보가 없습니다. 호가 기준 크로스 거래소 순수익이 {ALERT_THRESHOLD_PCT.toFixed(1)}% 이상이면 여기로 올라옵니다.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <WorkflowStat label="심볼" value={candidate.symbol} />
              <WorkflowStat label="경로" value={candidate.routeLabel} />
              <WorkflowStat label="매수" value={`${candidate.buyExchange} @ ${formatPrice(candidate.buyPrice)}`} mono />
              <WorkflowStat label="매도" value={`${candidate.sellExchange} @ ${formatPrice(candidate.sellPrice)}`} mono />
              <WorkflowStat label="실행 Gap %" value={formatPct(candidate.gapPct)} mono />
              <WorkflowStat label="예상 순수익" value={formatPct(candidate.estimatedNetPct)} mono highlight />
            </div>
          )}
        </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
            <h3 className="text-base font-semibold text-white">네트워크 상태</h3>
            <p className="mt-1 text-sm text-slate-400">DEX 비교를 위해서는 가격뿐 아니라 실제 입출금 가능한 체인 일치 여부가 중요합니다.</p>
            <div className="mt-4 space-y-3">
              <NetworkStatusCard label="빗썸" status={networkState?.bithumb} />
              <NetworkStatusCard label={networkState?.counterpartLabel ?? "상대 거래소"} status={networkState?.counterpartStatus} />
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-400">공통 실행 가능 네트워크</div>
                <div className="mt-2 text-sm text-white">
                  {networkState?.matchedNetworks.length ? formatNetworkSummary(networkState.matchedNetworks) : "공통 체인 없음 또는 확인 불가"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
            <h3 className="text-base font-semibold text-white">승인 단계</h3>
            <div className="mt-4 space-y-3">
              <WorkflowStepCard
                stepNumber="1"
                title="감지 알림"
                description="조건을 만족하는 후보가 감지되면 자동으로 1단계가 완료됩니다."
                status={step !== "idle" ? "done" : "current"}
              />
              <WorkflowStepCard
                stepNumber="2"
                title="출금 수량 확인"
                description="실제 출금할 수량을 입력하고 승인을 눌러 다음 단계로 넘깁니다."
                status={step === "quantity-approved" || step === "auth-approved" || step === "executed" ? "done" : step === "detected" ? "current" : "locked"}
              >
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={quantity}
                    onChange={(event) => onQuantityChange(event.target.value)}
                    placeholder="출금 수량"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={onApproveQuantity}
                    disabled={!canApproveQuantity}
                    className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    승인
                  </button>
                </div>
              </WorkflowStepCard>
              <WorkflowStepCard
                stepNumber="3"
                title="인증 알림"
                description="OTP나 추가 인증을 확인한 뒤, 사용자 승인을 눌러야만 출금 실행 버튼이 열립니다."
                status={step === "auth-approved" || step === "executed" ? "done" : step === "quantity-approved" ? "current" : "locked"}
              >
                <button
                  type="button"
                  onClick={onApproveAuth}
                  disabled={!canApproveAuth}
                  className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-500"
                >
                  인증 확인 후 승인
                </button>
              </WorkflowStepCard>
              <WorkflowStepCard
                stepNumber="4"
                title="출금"
                description="현재는 실제 API 호출 대신 마지막 승인과 기록만 수행합니다. API 키 연결 후 실출금으로 전환할 수 있습니다."
                status={step === "executed" ? "done" : step === "auth-approved" ? "current" : "locked"}
              >
                <button
                  type="button"
                  onClick={onExecute}
                  disabled={!canExecute}
                  className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-500"
                >
                  출금 실행 승인
                </button>
              </WorkflowStepCard>
            </div>
          </div>
        </div>
      </div> : (
        <CollapsedSummary
          items={
            candidate
              ? [
                  {
                    id: candidate.id,
                    primary: `${candidate.symbol} · ${candidate.routeLabel}`,
                    secondary: `순수익 ${formatPct(candidate.estimatedNetPct)} · 단계 ${formatStepLabel(step)}`,
                    accent: candidate.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300",
                  },
                  {
                    id: `${candidate.id}:gap`,
                    primary: "실행 Gap / 매수",
                    secondary: `${formatPct(candidate.gapPct)} · ${formatPrice(candidate.buyPrice)}`,
                  },
                  {
                    id: `${candidate.id}:sell`,
                    primary: "매도 / 수량",
                    secondary: `${formatPrice(candidate.sellPrice)} · ${quantity || "수량 미입력"}`,
                  },
                ]
              : []
          }
          emptyLabel="감지된 출금 후보가 없습니다."
        />
      )}
    </section>
  );
}

function WorkflowStat({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "font-mono tabular-nums" : "font-medium"} ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function stepTone(step: WorkflowStep) {
  switch (step) {
    case "executed":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "auth-approved":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
    case "quantity-approved":
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
    case "detected":
      return "border-white/10 bg-slate-900/80 text-slate-300";
    case "idle":
      return "border-white/10 bg-slate-900/80 text-slate-400";
  }
}

function exchangeDot(routeLabel: string) {
  if (routeLabel.includes("Binance")) return "bg-amber-400";
  if (routeLabel.includes("OKX")) return "bg-cyan-400";
  if (routeLabel.includes("Bithumb")) return "bg-rose-400";
  return "bg-slate-400";
}

function ExecutionBoard({
  candidate,
  logEntries,
}: {
  candidate: WorkflowCandidate | null;
  logEntries: WorkflowLogEntry[];
}) {
  const [tab, setTab] = useState<"positions" | "pending" | "history">("pending");

  const latestById = new Map<string, WorkflowLogEntry>();
  for (const entry of logEntries) {
    if (!latestById.has(entry.id)) {
      latestById.set(entry.id, entry);
    }
  }

  const positions = Array.from(latestById.values()).filter((entry) => entry.step === "executed");
  const pending = Array.from(latestById.values()).filter((entry) => entry.step !== "executed");
  const history = logEntries.slice(0, 12);

  const rows = tab === "positions" ? positions : tab === "pending" ? pending : history;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <ExecutionTab label={`Positions (${positions.length})`} active={tab === "positions"} onClick={() => setTab("positions")} />
        <ExecutionTab label={`Pending (${pending.length})`} active={tab === "pending"} onClick={() => setTab("pending")} />
        <ExecutionTab label={`History (${history.length})`} active={tab === "history"} onClick={() => setTab("history")} />
      </div>

      {candidate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">{candidate.symbol}</span>
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">{candidate.routeLabel}</span>
          <span className={`rounded-full border px-3 py-1 text-xs ${stepTone(logEntries[0]?.step ?? "idle")}`}>{formatStepLabel(logEntries[0]?.step ?? "idle")}</span>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr>
              <th className="w-[160px] px-4 py-3 text-left font-medium">EXCH</th>
              <th className="w-[120px] px-4 py-3 text-left font-medium">TYPE</th>
              <th className="w-[140px] px-4 py-3 text-left font-medium">SYMBOL</th>
              <th className="w-[120px] px-4 py-3 text-left font-medium">SIZE</th>
              <th className="px-4 py-3 text-left font-medium">ROUTE</th>
              <th className="w-[160px] px-4 py-3 text-left font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-slate-950/30">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {tab === "positions" ? "체결된 포지션이 없습니다." : tab === "pending" ? "대기 중인 후보가 없습니다." : "기록이 없습니다."}
                </td>
              </tr>
            ) : (
              rows.map((entry) => (
                <tr key={`${tab}-${entry.id}-${entry.updatedAt}`} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-slate-200">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${exchangeDot(entry.routeLabel)}`} />
                      <span>{entry.routeLabel.split(" -> ")[0]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">transfer</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{entry.symbol}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{entry.quantity || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{entry.routeLabel}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${stepTone(entry.step)}`}>{formatStepLabel(entry.step)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExecutionTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        active ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function WorkflowStepCard({
  stepNumber,
  title,
  description,
  status,
  children,
}: {
  stepNumber: string;
  title: string;
  description: string;
  status: "done" | "current" | "locked";
  children?: ReactNode;
}) {
  const tone =
    status === "done"
      ? "border-emerald-400/20 bg-emerald-400/10"
      : status === "current"
        ? "border-cyan-400/20 bg-cyan-400/10"
        : "border-white/10 bg-white/5";

  const badgeTone =
    status === "done"
      ? "bg-emerald-400 text-slate-950"
      : status === "current"
        ? "bg-cyan-400 text-slate-950"
        : "bg-slate-800 text-slate-400";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${badgeTone}`}>{stepNumber}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{description}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function NetworkStatusCard({ label, status }: { label: string; status?: TransferStatus }) {
  const networks = summarizeExecutableNetworks(status);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium text-white">{label}</div>
        <TransferStatusBadge enabled={status?.depositEnabled ?? null} label="입금" />
        <TransferStatusBadge enabled={status?.withdrawEnabled ?? null} label="출금" />
      </div>
      <div className="mt-3 text-xs text-slate-400">네트워크</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {networks.length ? (
          networks.slice(0, 6).map((network) => (
            <span key={`${label}-${network.networkKey}`} className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs text-slate-200">
              {network.networkLabel}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">확인 가능한 네트워크 없음</span>
        )}
      </div>
    </div>
  );
}

