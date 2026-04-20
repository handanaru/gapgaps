"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { hasVerifiedAssetIdentity } from "@/lib/asset-identity";
import { isBlockedExchangePairSymbolByLabel } from "@/lib/asset-identity-registry";
import { getDexExecutionStatus } from "@/lib/dex-execution";
import { getDexTokenBySymbol } from "@/lib/dex-tokens";
import { calculateArbitrage, calculateCrossExchangeArbitrage } from "@/lib/exchanges";
import { formatNetworkSummary, getMatchedNetworks, hasContractMismatch, summarizeExecutableNetworks } from "@/lib/networks";
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

async function parseJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} 요청 실패 (${response.status})${body ? `: ${body.slice(0, 120)}` : ""}`);
  }

  if (!contentType.includes("application/json")) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} 응답이 JSON이 아닙니다.${body.startsWith("<!DOCTYPE") ? " 개발 서버 에러 페이지가 반환됐습니다." : ""}`);
  }

  return (await response.json()) as T;
}

type SortDirection = "asc" | "desc";

type OpportunitySortKey = "symbol" | "buyExchange" | "sellExchange" | "buyPrice" | "sellPrice" | "spotPrice" | "futuresPrice" | "gapPct" | "estimatedNetPct";
type MatrixSortKey = "base" | "bithumbKrw" | "upbitKrw" | "okxKrw" | "binanceKrw" | "bybitKrw" | "gateioKrw" | "spreadPct";

type SortConfig<T extends string> = {
  key: T;
  direction: SortDirection;
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
type DexExecutionRow = {
  symbol: string;
  chainLabel: string;
  status: "executable" | "reference-only" | "blocked";
  reason: string;
  executionCode: string;
  matchedNetworkSummary: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  liquidityUsd?: number;
  sourceUrl?: string;
  contractAddress?: string;
  notes?: string;
};
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
type ChartLeg = {
  label: string;
  exchange: string;
  tradingViewSymbol: string | null;
};
type ChartSelection = {
  key: string;
  title: string;
  symbol: string;
  routeLabel: string;
  gapPct: number;
  estimatedNetPct: number;
  legs: [ChartLeg, ChartLeg];
};
type SpreadHistoryPoint = {
  timestamp: number;
  gapPct: number;
  estimatedNetPct: number;
};
type NavigationSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
};
type OpportunityFilterKind = "all" | "basis" | "perp-perp" | "cex-cex" | "cex-dex";
type AggregatedOpportunityRow = {
  id: string;
  kind: Exclude<OpportunityFilterKind, "all">;
  sourceTitle: string;
  routeLabel: string;
  opportunity: ArbitrageOpportunity;
  transferStatusConfig?: {
    leftExchangeLabel: string;
    leftStatuses: TransferStatusMap;
    rightExchangeLabel: string;
    rightStatuses?: TransferStatusMap;
    leftNotice?: string;
    rightNotice?: string;
  };
};

const DEFAULT_BINANCE_TAKER_FEE = 0.05;
const DEFAULT_BITHUMB_TAKER_FEE = 0.04;
const DEFAULT_OKX_TAKER_FEE = 0.05;
const DEFAULT_BYBIT_TAKER_FEE = 0.055;
const DEFAULT_GATEIO_TAKER_FEE = 0.075;
const POLL_INTERVAL_MS = 3000;
const TRANSFER_STATUS_POLL_MS = 300_000;
const ALERT_THRESHOLD_PCT = 1;


const MATRIX_COLUMNS: Array<{ key: MatrixSortKey; label: string }> = [
  { key: "base", label: "Coin" },
  { key: "bithumbKrw", label: "Bithumb (KRW)" },
  { key: "upbitKrw", label: "Upbit (KRW)" },
  { key: "okxKrw", label: "OKX (KRW)" },
  { key: "binanceKrw", label: "Binance (KRW)" },
  { key: "bybitKrw", label: "Bybit (KRW)" },
  { key: "gateioKrw", label: "Gate.io (KRW)" },
  { key: "spreadPct", label: "Spread %" },
];

const NAVIGATION_SECTIONS: NavigationSection[] = [
  { id: "overview", eyebrow: "Live Overview", title: "라이브 개요", description: "핵심 후보, 필터, 승인 흐름" },
  { id: "basis", eyebrow: "Basis Board", title: "현선 갭 보드", description: "거래소 내부 베이시스 스캔" },
  { id: "perp-perp", eyebrow: "Perp Spread Board", title: "선선 갭 보드", description: "거래소 간 선물 괴리" },
  { id: "cex-cex", eyebrow: "Domestic Premium Routes", title: "국내↔해외 CEX", description: "원화 축 기준 해외 CEX 비교" },
  { id: "cex-dex", eyebrow: "CEX-DEX Routes", title: "CEX↔DEX 루트", description: "체인 호환성 기반 현물 비교" },
  { id: "matrix", eyebrow: "Reference Matrix", title: "전체 시세 매트릭스", description: "참고용 전체 시장 스캔" },
];

function getOpportunityRouteLabel(title: string) {
  switch (title) {
    case "Bithumb KRW vs Binance Spot":
      return "Bithumb -> Binance";
    case "Upbit KRW vs Binance Spot":
      return "Upbit -> Binance";
    case "Bithumb KRW vs OKX Spot":
      return "Bithumb -> OKX";
    case "Upbit KRW vs OKX Spot":
      return "Upbit -> OKX";
    case "Bithumb KRW vs Bybit Spot":
      return "Bithumb -> Bybit";
    case "Upbit KRW vs Bybit Spot":
      return "Upbit -> Bybit";
    case "Bithumb KRW vs Gate.io Spot":
      return "Bithumb -> Gate.io";
    case "Upbit KRW vs Gate.io Spot":
      return "Upbit -> Gate.io";
    case "Bithumb KRW vs Solana DEX":
      return "Bithumb -> Solana DEX";
    default:
      return title;
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

function isDomesticKrwLeg(exchangeLabel: string) {
  return exchangeLabel === "Bithumb Spot" || exchangeLabel === "Upbit Spot";
}

function getCrossMarketPrices(opportunity: ArbitrageOpportunity) {
  return isDomesticKrwLeg(opportunity.buyExchange)
    ? { krwPrice: opportunity.buyPrice, spotPrice: opportunity.sellPrice }
    : { krwPrice: opportunity.sellPrice, spotPrice: opportunity.buyPrice };
}

function getOpportunityKindLabel(kind: Exclude<OpportunityFilterKind, "all">) {
  if (kind === "basis") return "현선갭";
  if (kind === "perp-perp") return "선선갭";
  if (kind === "cex-cex") return "국내↔해외 CEX";
  return "CEX-DEX";
}

function getOpportunityBoardMode(sourceTitle: string): "internal" | "krw-cross" | "cross" {
  if (sourceTitle.includes("KRW vs") || sourceTitle.includes("DEX")) return "krw-cross";
  if (sourceTitle.includes("Spot vs Futures") || sourceTitle.includes("Spot vs Perp")) return "internal";
  return "cross";
}

function getRowTargetId(row: AggregatedOpportunityRow) {
  if (row.sourceTitle === "Bithumb KRW vs Binance Spot") return "bithumb-binance";
  if (row.sourceTitle === "Bithumb KRW vs OKX Spot") return "bithumb-okx";
  if (row.sourceTitle === "Bithumb KRW vs Gate.io Spot") return "bithumb-gateio";
  if (row.sourceTitle === "Upbit KRW vs Bithumb KRW") return "upbit-bithumb";
  if (row.sourceTitle === "Upbit KRW vs OKX Spot") return "upbit-okx";
  if (row.sourceTitle === "Upbit KRW vs Binance Spot") return "upbit-binance";
  if (row.sourceTitle === "Upbit KRW vs Bybit Spot") return "upbit-bybit";
  if (row.sourceTitle === "Upbit KRW vs Gate.io Spot") return "upbit-gateio";
  if (row.sourceTitle === "Bithumb KRW vs Solana DEX") return "cex-dex";
  if (row.sourceTitle === "Binance Perp vs OKX Swap") return "perp-binance-okx";
  if (row.sourceTitle === "Binance Perp vs Bybit Perp") return "perp-binance-bybit";
  if (row.sourceTitle === "Binance Perp vs Gate.io Perp") return "perp-binance-gateio";
  if (row.sourceTitle === "OKX Swap vs Bybit Perp") return "perp-okx-bybit";
  if (row.sourceTitle === "OKX Swap vs Gate.io Perp") return "perp-okx-gateio";
  if (row.sourceTitle === "Bybit Perp vs Gate.io Perp") return "perp-bybit-gateio";
  if (row.kind === "basis") return "basis";
  if (row.kind === "cex-dex") return "cex-dex";
  if (row.kind === "cex-cex") return "cex-cex";
  return "perp-perp";
}

function getTradingViewSymbol(exchangeLabel: string, symbol: string) {
  const normalized = symbol.replace("/KRW", "");
  const base = normalized.replace("USDT", "").replace("KRW", "");
  const usdtSymbol = `${base}USDT`;

  if (exchangeLabel === "Binance Spot") return `BINANCE:${usdtSymbol}`;
  if (exchangeLabel === "Binance Futures" || exchangeLabel === "Binance Perp") return `BINANCE:${usdtSymbol}.P`;
  if (exchangeLabel === "OKX Spot") return `OKX:${usdtSymbol}`;
  if (exchangeLabel === "OKX Perp" || exchangeLabel === "OKX Swap") return `OKX:${usdtSymbol}.P`;
  if (exchangeLabel === "Bybit Spot") return `BYBIT:${usdtSymbol}`;
  if (exchangeLabel === "Bybit Perp") return `BYBIT:${usdtSymbol}.P`;
  if (exchangeLabel === "Gate.io Spot") return `GATEIO:${usdtSymbol}`;
  if (exchangeLabel === "Gate.io Perp") return `GATEIO:${usdtSymbol}.P`;
  if (exchangeLabel === "Bithumb Spot") return `BITHUMB:${base}KRW`;
  if (exchangeLabel === "Upbit Spot") return `UPBIT:${base}KRW`;

  return null;
}

function getTradingViewEmbedUrl(symbol: string, interval = "15") {
  const params = new URLSearchParams({
    symbol,
    interval,
    theme: "dark",
    style: "1",
    timezone: "Asia/Seoul",
    withdateranges: "1",
    hide_side_toolbar: "0",
    allow_symbol_change: "0",
    saveimage: "0",
    details: "1",
    hotlist: "0",
    calendar: "0",
  });

  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}

function getTradingViewSpreadExpression(legs: [ChartLeg, ChartLeg]) {
  const [left, right] = legs;
  if (!left.tradingViewSymbol || !right.tradingViewSymbol) return null;
  if (left.tradingViewSymbol === right.tradingViewSymbol) return left.tradingViewSymbol;
  return `(${left.tradingViewSymbol})-(${right.tradingViewSymbol})`;
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
      case "upbitKrw":
        return compareNumber(a.upbitKrw, b.upbitKrw, sortConfig.direction);
      case "okxKrw":
        return compareNumber(a.okxKrw, b.okxKrw, sortConfig.direction);
      case "binanceKrw":
        return compareNumber(a.binanceKrw, b.binanceKrw, sortConfig.direction);
      case "bybitKrw":
        return compareNumber(a.bybitKrw, b.bybitKrw, sortConfig.direction);
      case "gateioKrw":
        return compareNumber(a.gateioKrw, b.gateioKrw, sortConfig.direction);
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

function getChartSelection(title: string, opportunity: ArbitrageOpportunity): ChartSelection {
  return {
    key: `${title}:${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
    title,
    symbol: opportunity.symbol,
    routeLabel: getOpportunityRouteLabel(title),
    gapPct: opportunity.gapPct,
    estimatedNetPct: opportunity.estimatedNetPct,
    legs: [
      {
        label: "매수 레그",
        exchange: opportunity.buyExchange,
        tradingViewSymbol: getTradingViewSymbol(opportunity.buyExchange, opportunity.symbol),
      },
      {
        label: "매도 레그",
        exchange: opportunity.sellExchange,
        tradingViewSymbol: getTradingViewSymbol(opportunity.sellExchange, opportunity.symbol),
      },
    ],
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

  if (!leftStatus || !rightStatus) {
    return false;
  }

  if (hasContractMismatch(leftStatus, rightStatus)) {
    return false;
  }

  if (!hasVerifiedAssetIdentity(leftStatus, rightStatus)) {
    return false;
  }

  if (isDomesticKrwLeg(opportunity.buyExchange)) {
    return leftStatus.withdrawEnabled === true && rightStatus.depositEnabled === true;
  }

  return rightStatus.withdrawEnabled === true && leftStatus.depositEnabled === true;
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

  const movingFromLeft = isDomesticKrwLeg(opportunity.buyExchange);
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

function getExecutionReasons(
  opportunity: ArbitrageOpportunity,
  leftStatus: TransferStatus | undefined,
  rightStatus?: TransferStatus
) {
  const reasons: Array<{ label: string; tone: string }> = [];

  if (!leftStatus || !rightStatus) {
    reasons.push({ label: "status missing", tone: "border-white/10 bg-slate-900/80 text-slate-400" });
    return reasons;
  }

  const movingFromLeft = isDomesticKrwLeg(opportunity.buyExchange);
  const sourceStatus = movingFromLeft ? leftStatus : rightStatus;
  const destinationStatus = movingFromLeft ? rightStatus : leftStatus;
  const matchedNetworks = getMatchedNetworks(sourceStatus, destinationStatus);

  reasons.push({
    label: sourceStatus.withdrawEnabled === true ? "withdraw ok" : "withdraw blocked",
    tone: sourceStatus.withdrawEnabled === true ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200",
  });
  reasons.push({
    label: destinationStatus.depositEnabled === true ? "deposit ok" : "deposit blocked",
    tone: destinationStatus.depositEnabled === true ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200",
  });

  if (hasContractMismatch(sourceStatus, destinationStatus)) {
    reasons.push({ label: "contract mismatch", tone: "border-rose-400/20 bg-rose-500/10 text-rose-200" });
  }

  if (matchedNetworks.length > 0) {
    reasons.push({ label: `network ${matchedNetworks.length}x`, tone: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100" });
  } else {
    reasons.push({ label: "network mismatch", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" });
  }

  if (hasVerifiedAssetIdentity(sourceStatus, destinationStatus)) {
    reasons.push({ label: "identity verified", tone: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" });
  } else {
    reasons.push({ label: "identity unclear", tone: "border-white/10 bg-slate-900/80 text-slate-400" });
  }

  return reasons.slice(0, 4);
}

function getConfidenceReasons(leftNotice?: string, rightNotice?: string) {
  const reasons: Array<{ label: string; tone: string }> = [];

  if (leftNotice?.includes("업비트")) {
    reasons.push({ label: "upbit status limited", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" });
  }

  if (rightNotice?.includes("업비트")) {
    reasons.push({ label: "upbit status limited", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" });
  }

  if (leftNotice?.includes("미지원") || rightNotice?.includes("미지원") || leftNotice?.includes("unavailable") || rightNotice?.includes("unavailable")) {
    reasons.push({ label: "partial verification", tone: "border-white/10 bg-slate-900/80 text-slate-300" });
  }

  return reasons;
}

export default function Home() {
  const [binanceSpotTickers, setBinanceSpotTickers] = useState<NormalizedTicker[]>([]);
  const [binanceFuturesTickers, setBinanceFuturesTickers] = useState<NormalizedTicker[]>([]);
  const [binancePerpEnabled, setBinancePerpEnabled] = useState(true);
  const [binancePerpError, setBinancePerpError] = useState<string | null>(null);
  const [bithumbSpotTickers, setBithumbSpotTickers] = useState<NormalizedTicker[]>([]);
  const [upbitSpotTickers, setUpbitSpotTickers] = useState<NormalizedTicker[]>([]);
  const [okxSpotTickers, setOkxSpotTickers] = useState<NormalizedTicker[]>([]);
  const [okxPerpTickers, setOkxPerpTickers] = useState<NormalizedTicker[]>([]);
  const [bybitSpotTickers, setBybitSpotTickers] = useState<NormalizedTicker[]>([]);
  const [bybitPerpTickers, setBybitPerpTickers] = useState<NormalizedTicker[]>([]);
  const [gateIoSpotTickers, setGateIoSpotTickers] = useState<NormalizedTicker[]>([]);
  const [gateIoPerpTickers, setGateIoPerpTickers] = useState<NormalizedTicker[]>([]);
  const [solanaDexTickers, setSolanaDexTickers] = useState<NormalizedTicker[]>([]);
  const [usdtKrwRate, setUsdtKrwRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [minSpreadFilter, setMinSpreadFilter] = useState(0.5);
  const [matrixRequireFutures, setMatrixRequireFutures] = useState(true);
  const [binanceFeePct] = useState(DEFAULT_BINANCE_TAKER_FEE);
  const [bithumbFeePct] = useState(DEFAULT_BITHUMB_TAKER_FEE);
  const [okxFeePct] = useState(DEFAULT_OKX_TAKER_FEE);
  const [bybitFeePct] = useState(DEFAULT_BYBIT_TAKER_FEE);
  const [gateIoFeePct] = useState(DEFAULT_GATEIO_TAKER_FEE);
  const [minVolumeUsdt] = useState(0);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const [matrixSortConfig, setMatrixSortConfig] = useState<SortConfig<MatrixSortKey>>({ key: "spreadPct", direction: "asc" });
  const [matrixOrderLock, setMatrixOrderLock] = useState<string[] | null>(null);
  const [bithumbTransferStatus, setBithumbTransferStatus] = useState<TransferStatusMap>({});
  const [binanceTransferStatus, setBinanceTransferStatus] = useState<TransferStatusMap>({});
  const [bybitTransferStatus, setBybitTransferStatus] = useState<TransferStatusMap>({});
  const [gateIoTransferStatus, setGateIoTransferStatus] = useState<TransferStatusMap>({});
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("idle");
  const [workflowCandidate, setWorkflowCandidate] = useState<WorkflowCandidate | null>(null);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("auto");
  const [workflowQuantity, setWorkflowQuantity] = useState("");
  const [workflowUpdatedAt, setWorkflowUpdatedAt] = useState<number | null>(null);
  const [workflowLog, setWorkflowLog] = useState<WorkflowLogEntry[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartSelection | null>(null);
  const [spreadHistoryByKey, setSpreadHistoryByKey] = useState<Record<string, SpreadHistoryPoint[]>>({});
  const [alertsCollapsed, setAlertsCollapsed] = useState(true);
  const [workflowCollapsed, setWorkflowCollapsed] = useState(true);
  const [filteredViewCollapsed, setFilteredViewCollapsed] = useState(true);
  const [showAllActionRows, setShowAllActionRows] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [opportunityFilterKind, setOpportunityFilterKind] = useState<OpportunityFilterKind>("all");
  const [opportunityExecutableOnly, setOpportunityExecutableOnly] = useState(true);
  const workflowLogSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [binanceSpotRes, binanceFuturesRes, bithumbRes, upbitRes, okxRes, okxPerpRes, bybitRes, bybitPerpRes, gateIoRes, gateIoPerpRes, solanaDexRes, fxRes] = await Promise.all([
          fetch("/api/binance/spot"),
          fetch("/api/binance/perp"),
          fetch("/api/bithumb/spot"),
          fetch("/api/upbit/spot"),
          fetch("/api/okx/spot"),
          fetch("/api/okx/swap"),
          fetch("/api/bybit/spot"),
          fetch("/api/bybit/perp"),
          fetch("/api/gateio/spot"),
          fetch("/api/gateio/perp"),
          fetch("/api/dex/solana"),
          fetch("/api/fx/usdt-krw"),
        ]);

        const [binanceSpotJson, binanceFuturesJson, bithumbJson, upbitJson, okxJson, okxPerpJson, bybitJson, bybitPerpJson, gateIoJson, gateIoPerpJson, solanaDexJson, fxJson] = await Promise.all([
          parseJsonResponse<ApiResponse>(binanceSpotRes, "Binance spot"),
          parseJsonResponse<ApiResponse>(binanceFuturesRes, "Binance perp"),
          parseJsonResponse<ApiResponse>(bithumbRes, "Bithumb spot"),
          parseJsonResponse<ApiResponse>(upbitRes, "Upbit spot"),
          parseJsonResponse<ApiResponse>(okxRes, "OKX spot"),
          parseJsonResponse<ApiResponse>(okxPerpRes, "OKX swap"),
          parseJsonResponse<ApiResponse>(bybitRes, "Bybit spot"),
          parseJsonResponse<ApiResponse>(bybitPerpRes, "Bybit perp"),
          parseJsonResponse<ApiResponse>(gateIoRes, "Gate.io spot"),
          parseJsonResponse<ApiResponse>(gateIoPerpRes, "Gate.io perp"),
          parseJsonResponse<ApiResponse>(solanaDexRes, "Solana DEX"),
          parseJsonResponse<FxResponse>(fxRes, "USDT/KRW"),
        ]);

        if (
          !binanceSpotJson.success ||
          !bithumbJson.success ||
          !upbitJson.success ||
          !okxJson.success ||
          !okxPerpJson.success ||
          !bybitJson.success ||
          !bybitPerpJson.success ||
          !gateIoJson.success ||
          !gateIoPerpJson.success ||
          !solanaDexJson.success ||
          !fxJson.success ||
          !binanceSpotJson.data ||
          !bithumbJson.data ||
          !upbitJson.data ||
          !okxJson.data ||
          !okxPerpJson.data ||
          !bybitJson.data ||
          !bybitPerpJson.data ||
          !gateIoJson.data ||
          !gateIoPerpJson.data ||
          !solanaDexJson.data ||
          !fxJson.data
        ) {
          throw new Error(
            binanceSpotJson.error ||
              bithumbJson.error ||
              upbitJson.error ||
              okxJson.error ||
              okxPerpJson.error ||
              bybitJson.error ||
              bybitPerpJson.error ||
              gateIoJson.error ||
              gateIoPerpJson.error ||
              solanaDexJson.error ||
              fxJson.error ||
              "시세 데이터를 불러오지 못했습니다."
          );
        }

        if (!cancelled) {
          setBinanceSpotTickers(binanceSpotJson.data);
          setBinanceFuturesTickers(binanceFuturesJson.success && binanceFuturesJson.data ? binanceFuturesJson.data : []);
          setBinancePerpEnabled(Boolean(binanceFuturesJson.success && binanceFuturesJson.data));
          setBinancePerpError(binanceFuturesJson.success ? null : binanceFuturesJson.error ?? "Binance perp fetch failed");
          setBithumbSpotTickers(bithumbJson.data);
          setUpbitSpotTickers(upbitJson.data);
          setOkxSpotTickers(okxJson.data);
          setOkxPerpTickers(okxPerpJson.data);
          setBybitSpotTickers(bybitJson.data);
          setBybitPerpTickers(bybitPerpJson.data);
          setGateIoSpotTickers(gateIoJson.data);
          setGateIoPerpTickers(gateIoPerpJson.data);
          setSolanaDexTickers(solanaDexJson.data);
          setUsdtKrwRate(fxJson.data.rate);
          setLastUpdated(
            Math.max(
              binanceSpotJson.fetchedAt ?? 0,
              binanceFuturesJson.fetchedAt ?? 0,
              bithumbJson.fetchedAt ?? 0,
              upbitJson.fetchedAt ?? 0,
              okxJson.fetchedAt ?? 0,
              okxPerpJson.fetchedAt ?? 0,
              bybitJson.fetchedAt ?? 0,
              bybitPerpJson.fetchedAt ?? 0,
              gateIoJson.fetchedAt ?? 0,
              gateIoPerpJson.fetchedAt ?? 0,
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
      const [bithumbStatusResult, binanceStatusResult, bybitStatusResult, gateIoStatusResult] = await Promise.allSettled([
        fetch("/api/bithumb/status"),
        fetch("/api/binance/status"),
        fetch("/api/bybit/status"),
        fetch("/api/gateio/status"),
      ]);

      if (cancelled) return;

      if (bithumbStatusResult.status === "fulfilled") {
        const json = await parseJsonResponse<TransferStatusResponse>(bithumbStatusResult.value, "Bithumb status");
        if (json.success && json.data) {
          setBithumbTransferStatus(json.data);
        }
      }

      if (binanceStatusResult.status === "fulfilled") {
        const json = await parseJsonResponse<TransferStatusResponse>(binanceStatusResult.value, "Binance status");
        if (json.success && json.data) {
          setBinanceTransferStatus(json.data);
        }
      }

      if (bybitStatusResult.status === "fulfilled") {
        const json = await parseJsonResponse<TransferStatusResponse>(bybitStatusResult.value, "Bybit status");
        if (json.success && json.data) {
          setBybitTransferStatus(json.data);
        }
      }

      if (gateIoStatusResult.status === "fulfilled") {
        const json = await parseJsonResponse<TransferStatusResponse>(gateIoStatusResult.value, "Gate.io status");
        if (json.success && json.data) {
          setGateIoTransferStatus(json.data);
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

  const bithumbBybitOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : bithumbSpotTickers;
    const filteredBybit =
      minVolumeUsdt > 0
        ? bybitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : bybitSpotTickers;

    return calculateCrossExchangeArbitrage(filteredBithumb, filteredBybit, {
      leftFeePct: bithumbFeePct,
      rightFeePct: bybitFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "Bybit Spot",
    });
  }, [bithumbSpotTickers, bybitSpotTickers, usdtKrwRate, bithumbFeePct, bybitFeePct, minVolumeUsdt]);

  const bithumbGateIoOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : bithumbSpotTickers;
    const filteredGateIo =
      minVolumeUsdt > 0
        ? gateIoSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : gateIoSpotTickers;

    return calculateCrossExchangeArbitrage(filteredBithumb, filteredGateIo, {
      leftFeePct: bithumbFeePct,
      rightFeePct: gateIoFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "Gate.io Spot",
    });
  }, [bithumbSpotTickers, gateIoSpotTickers, usdtKrwRate, bithumbFeePct, gateIoFeePct, minVolumeUsdt]);

  const upbitOkxOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredUpbit =
      minVolumeUsdt > 0
        ? upbitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : upbitSpotTickers;
    const filteredOkx =
      minVolumeUsdt > 0 ? okxSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt) : okxSpotTickers;

    return calculateCrossExchangeArbitrage(filteredUpbit, filteredOkx, {
      leftFeePct: bithumbFeePct,
      rightFeePct: okxFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Upbit Spot",
      rightLabel: "OKX Spot",
    });
  }, [upbitSpotTickers, okxSpotTickers, usdtKrwRate, bithumbFeePct, okxFeePct, minVolumeUsdt]);

  const upbitBinanceOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredUpbit =
      minVolumeUsdt > 0
        ? upbitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : upbitSpotTickers;
    const filteredBinance =
      minVolumeUsdt > 0
        ? binanceSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : binanceSpotTickers;

    return calculateCrossExchangeArbitrage(filteredUpbit, filteredBinance, {
      leftFeePct: bithumbFeePct,
      rightFeePct: binanceFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Upbit Spot",
      rightLabel: "Binance Spot",
    });
  }, [upbitSpotTickers, binanceSpotTickers, usdtKrwRate, bithumbFeePct, binanceFeePct, minVolumeUsdt]);

  const upbitBybitOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredUpbit =
      minVolumeUsdt > 0
        ? upbitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : upbitSpotTickers;
    const filteredBybit =
      minVolumeUsdt > 0
        ? bybitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : bybitSpotTickers;

    return calculateCrossExchangeArbitrage(filteredUpbit, filteredBybit, {
      leftFeePct: bithumbFeePct,
      rightFeePct: bybitFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Upbit Spot",
      rightLabel: "Bybit Spot",
    });
  }, [upbitSpotTickers, bybitSpotTickers, usdtKrwRate, bithumbFeePct, bybitFeePct, minVolumeUsdt]);

  const upbitGateIoOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const filteredUpbit =
      minVolumeUsdt > 0
        ? upbitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt)
        : upbitSpotTickers;
    const filteredGateIo =
      minVolumeUsdt > 0
        ? gateIoSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h >= minVolumeUsdt)
        : gateIoSpotTickers;

    return calculateCrossExchangeArbitrage(filteredUpbit, filteredGateIo, {
      leftFeePct: bithumbFeePct,
      rightFeePct: gateIoFeePct,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Upbit Spot",
      rightLabel: "Gate.io Spot",
    });
  }, [upbitSpotTickers, gateIoSpotTickers, usdtKrwRate, bithumbFeePct, gateIoFeePct, minVolumeUsdt]);

  const upbitBithumbOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    const filteredUpbit =
      minVolumeUsdt > 0
        ? upbitSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / (usdtKrwRate || 1) >= minVolumeUsdt)
        : upbitSpotTickers;
    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter((ticker) => ticker.volume24h !== undefined && ticker.volume24h / (usdtKrwRate || 1) >= minVolumeUsdt)
        : bithumbSpotTickers;

    return calculateCrossExchangeArbitrage(filteredUpbit, filteredBithumb, {
      leftFeePct: bithumbFeePct,
      rightFeePct: bithumbFeePct,
      leftLabel: "Upbit Spot",
      rightLabel: "Bithumb Spot",
    });
  }, [upbitSpotTickers, bithumbSpotTickers, usdtKrwRate, bithumbFeePct, minVolumeUsdt]);

  const solanaDexExecutableSymbols = useMemo(() => {
    return new Set(
      solanaDexTickers
        .filter((ticker) => {
          const dexToken = getDexTokenBySymbol(ticker.base);
          if (!dexToken) return false;
          return getDexExecutionStatus(dexToken, bithumbTransferStatus[ticker.base]).status === "executable";
        })
        .map((ticker) => ticker.base)
    );
  }, [bithumbTransferStatus, solanaDexTickers]);

  const bithumbSolanaDexOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    if (!usdtKrwRate) return [];

    const executableDexTickers = solanaDexTickers.filter((ticker) => solanaDexExecutableSymbols.has(ticker.base));
    const filteredBithumb =
      minVolumeUsdt > 0
        ? bithumbSpotTickers.filter(
            (ticker) =>
              solanaDexExecutableSymbols.has(ticker.base) && ticker.volume24h !== undefined && ticker.volume24h / usdtKrwRate >= minVolumeUsdt
          )
        : bithumbSpotTickers.filter((ticker) => solanaDexExecutableSymbols.has(ticker.base));

    return calculateCrossExchangeArbitrage(filteredBithumb, executableDexTickers, {
      leftFeePct: bithumbFeePct,
      rightFeePct: 0.3,
      rightQuoteToKrw: usdtKrwRate,
      leftLabel: "Bithumb Spot",
      rightLabel: "Solana DEX",
    });
  }, [bithumbSpotTickers, solanaDexExecutableSymbols, solanaDexTickers, usdtKrwRate, bithumbFeePct, minVolumeUsdt]);

  const okxInternalOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateArbitrage(okxSpotTickers, okxPerpTickers, okxFeePct);
  }, [okxSpotTickers, okxPerpTickers, okxFeePct]);
  const binanceOkxPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(binanceFuturesTickers, okxPerpTickers, {
      leftFeePct: binanceFeePct,
      rightFeePct: okxFeePct,
      leftLabel: "Binance Perp",
      rightLabel: "OKX Swap",
    });
  }, [binanceFuturesTickers, okxPerpTickers, binanceFeePct, okxFeePct]);
  const binanceBybitPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(binanceFuturesTickers, bybitPerpTickers, {
      leftFeePct: binanceFeePct,
      rightFeePct: bybitFeePct,
      leftLabel: "Binance Perp",
      rightLabel: "Bybit Perp",
    });
  }, [binanceFuturesTickers, bybitPerpTickers, binanceFeePct, bybitFeePct]);
  const binanceGateIoPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(binanceFuturesTickers, gateIoPerpTickers, {
      leftFeePct: binanceFeePct,
      rightFeePct: gateIoFeePct,
      leftLabel: "Binance Perp",
      rightLabel: "Gate.io Perp",
    });
  }, [binanceFuturesTickers, gateIoPerpTickers, binanceFeePct, gateIoFeePct]);
  const okxBybitPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(okxPerpTickers, bybitPerpTickers, {
      leftFeePct: okxFeePct,
      rightFeePct: bybitFeePct,
      leftLabel: "OKX Swap",
      rightLabel: "Bybit Perp",
    });
  }, [okxPerpTickers, bybitPerpTickers, okxFeePct, bybitFeePct]);
  const okxGateIoPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(okxPerpTickers, gateIoPerpTickers, {
      leftFeePct: okxFeePct,
      rightFeePct: gateIoFeePct,
      leftLabel: "OKX Swap",
      rightLabel: "Gate.io Perp",
    });
  }, [okxPerpTickers, gateIoPerpTickers, okxFeePct, gateIoFeePct]);
  const bybitGateIoPerpOpportunities = useMemo<ArbitrageOpportunity[]>(() => {
    return calculateCrossExchangeArbitrage(bybitPerpTickers, gateIoPerpTickers, {
      leftFeePct: bybitFeePct,
      rightFeePct: gateIoFeePct,
      leftLabel: "Bybit Perp",
      rightLabel: "Gate.io Perp",
    });
  }, [bybitPerpTickers, gateIoPerpTickers, bybitFeePct, gateIoFeePct]);

  const topBinance = binanceInternalOpportunities.slice(0, 15);
  const topOkx = okxInternalOpportunities.slice(0, 15);
  const topPerpPerp = binanceOkxPerpOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topPerpPerpBybit = binanceBybitPerpOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topPerpPerpGateIo = binanceGateIoPerpOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => !isBlockedExchangePairSymbolByLabel(item.buyExchange, item.sellExchange, item.symbol))
    .slice(0, 15);
  const topOkxBybitPerp = okxBybitPerpOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => !isBlockedExchangePairSymbolByLabel(item.buyExchange, item.sellExchange, item.symbol))
    .slice(0, 15);
  const topOkxGateIoPerp = okxGateIoPerpOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => !isBlockedExchangePairSymbolByLabel(item.buyExchange, item.sellExchange, item.symbol))
    .slice(0, 15);
  const topBybitGateIoPerp = bybitGateIoPerpOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => !isBlockedExchangePairSymbolByLabel(item.buyExchange, item.sellExchange, item.symbol))
    .slice(0, 15);
  const topCrossExchange = bithumbOkxOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => isTransferReadyForOpportunity(item, bithumbTransferStatus))
    .slice(0, 15);
  const topBithumbBinance = bithumbBinanceOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => isTransferReadyForOpportunity(item, bithumbTransferStatus, binanceTransferStatus))
    .slice(0, 15);
  const topBithumbBybit = bithumbBybitOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => isTransferReadyForOpportunity(item, bithumbTransferStatus, bybitTransferStatus))
    .slice(0, 15);
  const topBithumbGateIo = bithumbGateIoOpportunities
    .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
    .filter((item) => isTransferReadyForOpportunity(item, bithumbTransferStatus, gateIoTransferStatus))
    .slice(0, 15);
  const topUpbitOkx = upbitOkxOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topUpbitBinance = upbitBinanceOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topUpbitBybit = upbitBybitOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topUpbitGateIo = upbitGateIoOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topUpbitBithumb = upbitBithumbOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topBithumbSolanaDex = bithumbSolanaDexOpportunities.filter((item) => Math.abs(item.gapPct) >= minSpreadFilter).slice(0, 15);
  const topAnyCrossExchange = useMemo(() => {
    return [...bithumbOkxOpportunities, ...bithumbBinanceOpportunities, ...bithumbBybitOpportunities, ...bithumbGateIoOpportunities]
      .filter((item) => Math.abs(item.gapPct) >= minSpreadFilter)
      .sort((a, b) => b.estimatedNetPct - a.estimatedNetPct);
  }, [bithumbBinanceOpportunities, bithumbBybitOpportunities, bithumbGateIoOpportunities, bithumbOkxOpportunities, minSpreadFilter]);
  const executableCrossExchangeCount = useMemo(() => {
    return topAnyCrossExchange.filter((opportunity) => {
      if (opportunity.buyExchange.includes("Binance") || opportunity.sellExchange.includes("Binance")) {
        return isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, binanceTransferStatus);
      }
      if (opportunity.buyExchange.includes("Gate.io") || opportunity.sellExchange.includes("Gate.io")) {
        return isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, gateIoTransferStatus);
      }
      if (opportunity.buyExchange.includes("Bybit") || opportunity.sellExchange.includes("Bybit")) {
        return isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, bybitTransferStatus);
      }
      return isTransferReadyForOpportunity(opportunity, bithumbTransferStatus);
    }).length;
  }, [binanceTransferStatus, bithumbTransferStatus, bybitTransferStatus, gateIoTransferStatus, topAnyCrossExchange]);
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || notificationPermission !== "granted") return;
    if (topAnyCrossExchange.length === 0) return;

    const top = topAnyCrossExchange[0];
    if (top.estimatedNetPct < ALERT_THRESHOLD_PCT) return;

    const notificationId = `gapgaps:${top.symbol}:${top.buyExchange}:${top.sellExchange}:${top.estimatedNetPct.toFixed(3)}`;
    if (sessionStorage.getItem(notificationId)) return;

    sessionStorage.setItem(notificationId, "1");
    new Notification("GapGaps Opportunity", {
      body: `${top.symbol} ${top.buyExchange} -> ${top.sellExchange} | 예상 순수익 ${top.estimatedNetPct.toFixed(3)}%`,
    });
  }, [notificationsEnabled, notificationPermission, topAnyCrossExchange]);

  const priceMatrixRows = useMemo(() => {
    if (!usdtKrwRate) return [];

    const binanceMap = new Map(binanceSpotTickers.map((ticker) => [ticker.base, ticker]));
    const binanceFuturesBaseSet = new Set(binanceFuturesTickers.map((ticker) => ticker.base));
    const bithumbMap = new Map(bithumbSpotTickers.map((ticker) => [ticker.base, ticker]));
    const upbitMap = new Map(upbitSpotTickers.map((ticker) => [ticker.base, ticker]));
    const okxMap = new Map(okxSpotTickers.map((ticker) => [ticker.base, ticker]));
    const bybitMap = new Map(bybitSpotTickers.map((ticker) => [ticker.base, ticker]));
    const gateIoMap = new Map(gateIoSpotTickers.map((ticker) => [ticker.base, ticker]));

    const bases = Array.from(
      new Set([
        ...Array.from(bithumbMap.keys()),
        ...Array.from(upbitMap.keys()),
        ...Array.from(okxMap.keys()),
        ...Array.from(binanceMap.keys()),
        ...Array.from(bybitMap.keys()),
        ...Array.from(gateIoMap.keys()),
      ])
    ).sort();

    return bases
      .map((base) => {
        if (matrixRequireFutures && !binanceFuturesBaseSet.has(base)) return null;

        const bithumb = bithumbMap.get(base);
        const upbit = upbitMap.get(base);
        const okx = okxMap.get(base);
        const binance = binanceMap.get(base);
        const bybit = bybitMap.get(base);
        const gateIo = gateIoMap.get(base);

        const bithumbKrw = bithumb?.price ?? null;
        const upbitKrw = upbit?.price ?? null;
        const okxKrw = okx ? okx.price * usdtKrwRate : null;
        const binanceKrw = binance ? binance.price * usdtKrwRate : null;
        const bybitKrw = bybit ? bybit.price * usdtKrwRate : null;
        const gateioKrw = gateIo ? gateIo.price * usdtKrwRate : null;

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
        };
      })
      .filter((row): row is MatrixRow => row !== null)
      .filter((row) => row.spreadPct >= minSpreadFilter)
      .sort((a, b) => b.spreadPct - a.spreadPct)
      .slice(0, 25);
  }, [binanceSpotTickers, binanceFuturesTickers, bithumbSpotTickers, upbitSpotTickers, okxSpotTickers, bybitSpotTickers, gateIoSpotTickers, usdtKrwRate, minSpreadFilter, matrixRequireFutures]);

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

  const bybitSpotPriceMap = useMemo<ForeignPriceMap>(() => {
    return new Map(bybitSpotTickers.map((ticker) => [ticker.base, { price: ticker.price, quote: ticker.quote }]));
  }, [bybitSpotTickers]);

  const gateIoSpotPriceMap = useMemo<ForeignPriceMap>(() => {
    return new Map(gateIoSpotTickers.map((ticker) => [ticker.base, { price: ticker.price, quote: ticker.quote }]));
  }, [gateIoSpotTickers]);

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

  const solanaDexExecutionRows = useMemo<DexExecutionRow[]>(() => {
    return solanaDexTickers
      .flatMap((ticker) => {
        const dexToken = getDexTokenBySymbol(ticker.base);
        if (!dexToken) return [];

        const execution = getDexExecutionStatus(dexToken, bithumbTransferStatus[ticker.base]);
        return [
          {
            symbol: ticker.base,
            chainLabel: dexToken.chainId,
            status: execution.status,
            reason: execution.reason,
            executionCode: execution.code,
            matchedNetworkSummary: formatNetworkSummary(execution.matchedNetworks),
            depositEnabled: execution.depositEnabled,
            withdrawEnabled: execution.withdrawEnabled,
            liquidityUsd: ticker.metadata?.liquidityUsd,
            sourceUrl: ticker.metadata?.sourceUrl,
            contractAddress: dexToken.contractAddress,
            notes: dexToken.notes,
          },
        ];
      })
      .sort((left, right) => {
        const statusRank = { executable: 0, "reference-only": 1, blocked: 2 } as const;
        return statusRank[left.status] - statusRank[right.status] || left.symbol.localeCompare(right.symbol);
      });
  }, [bithumbTransferStatus, solanaDexTickers]);
  const foreignPriceMapBySourceTitle = useMemo<Record<string, ForeignPriceMap>>(() => {
    return {
      "Bithumb KRW vs OKX Spot": okxSpotPriceMap,
      "Upbit KRW vs OKX Spot": okxSpotPriceMap,
      "Bithumb KRW vs Binance Spot": binanceSpotPriceMap,
      "Upbit KRW vs Binance Spot": binanceSpotPriceMap,
      "Bithumb KRW vs Bybit Spot": bybitSpotPriceMap,
      "Upbit KRW vs Bybit Spot": bybitSpotPriceMap,
      "Bithumb KRW vs Gate.io Spot": gateIoSpotPriceMap,
      "Upbit KRW vs Gate.io Spot": gateIoSpotPriceMap,
      "Bithumb KRW vs Solana DEX": solanaDexPriceMap,
    };
  }, [binanceSpotPriceMap, bybitSpotPriceMap, gateIoSpotPriceMap, okxSpotPriceMap, solanaDexPriceMap]);
  const aggregatedOpportunityRows = useMemo<AggregatedOpportunityRow[]>(() => {
    const rows: AggregatedOpportunityRow[] = [];

    const pushRows = (
      kind: Exclude<OpportunityFilterKind, "all">,
      sourceTitle: string,
      opportunities: ArbitrageOpportunity[],
      transferStatusConfig?: AggregatedOpportunityRow["transferStatusConfig"]
    ) => {
      opportunities.forEach((opportunity) => {
        rows.push({
          id: `${kind}:${sourceTitle}:${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
          kind,
          sourceTitle,
          routeLabel: getOpportunityRouteLabel(sourceTitle),
          opportunity,
          transferStatusConfig,
        });
      });
    };

    pushRows("basis", "Binance Spot vs Futures", topBinance);
    pushRows("basis", "OKX Spot vs Perp", topOkx);
    pushRows("perp-perp", "Binance Perp vs OKX Swap", topPerpPerp);
    pushRows("perp-perp", "Binance Perp vs Bybit Perp", topPerpPerpBybit);
    pushRows("perp-perp", "Binance Perp vs Gate.io Perp", topPerpPerpGateIo);
    pushRows("perp-perp", "OKX Swap vs Bybit Perp", topOkxBybitPerp);
    pushRows("perp-perp", "OKX Swap vs Gate.io Perp", topOkxGateIoPerp);
    pushRows("perp-perp", "Bybit Perp vs Gate.io Perp", topBybitGateIoPerp);
    pushRows("cex-cex", "Bithumb KRW vs OKX Spot", topCrossExchange, {
      leftExchangeLabel: "빗썸",
      leftStatuses: bithumbTransferStatus,
      rightExchangeLabel: "OKX",
      rightNotice: "공개 API 미지원",
    });
    pushRows("cex-cex", "Bithumb KRW vs Binance Spot", topBithumbBinance, {
      leftExchangeLabel: "빗썸",
      leftStatuses: bithumbTransferStatus,
      rightExchangeLabel: "바이낸스",
      rightStatuses: binanceTransferStatus,
    });
    pushRows("cex-cex", "Bithumb KRW vs Bybit Spot", topBithumbBybit, {
      leftExchangeLabel: "빗썸",
      leftStatuses: bithumbTransferStatus,
      rightExchangeLabel: "Bybit",
      rightStatuses: bybitTransferStatus,
    });
    pushRows("cex-cex", "Bithumb KRW vs Gate.io Spot", topBithumbGateIo, {
      leftExchangeLabel: "빗썸",
      leftStatuses: bithumbTransferStatus,
      rightExchangeLabel: "Gate.io",
      rightStatuses: gateIoTransferStatus,
    });
    pushRows("cex-cex", "Upbit KRW vs OKX Spot", topUpbitOkx, {
      leftExchangeLabel: "업비트",
      leftStatuses: {},
      rightExchangeLabel: "OKX",
      rightNotice: "업비트/OKX 공개 전송 상태 미지원",
    });
    pushRows("cex-cex", "Upbit KRW vs Binance Spot", topUpbitBinance, {
      leftExchangeLabel: "업비트",
      leftStatuses: {},
      rightExchangeLabel: "바이낸스",
      rightStatuses: binanceTransferStatus,
      leftNotice: "업비트 공개 전송 상태 미지원",
    });
    pushRows("cex-cex", "Upbit KRW vs Bybit Spot", topUpbitBybit, {
      leftExchangeLabel: "업비트",
      leftStatuses: {},
      rightExchangeLabel: "Bybit",
      rightStatuses: bybitTransferStatus,
      leftNotice: "업비트 공개 전송 상태 미지원",
      rightNotice: "Bybit transfer status unavailable",
    });
    pushRows("cex-cex", "Upbit KRW vs Gate.io Spot", topUpbitGateIo, {
      leftExchangeLabel: "업비트",
      leftStatuses: {},
      rightExchangeLabel: "Gate.io",
      rightStatuses: gateIoTransferStatus,
      leftNotice: "업비트 공개 전송 상태 미지원",
    });
    pushRows("cex-dex", "Bithumb KRW vs Solana DEX", topBithumbSolanaDex, {
      leftExchangeLabel: "빗썸",
      leftStatuses: bithumbTransferStatus,
      rightExchangeLabel: "Solana DEX",
      rightStatuses: solanaDexTransferStatus,
    });

    return rows.sort((left, right) => right.opportunity.estimatedNetPct - left.opportunity.estimatedNetPct);
  }, [
    bithumbTransferStatus,
    binanceTransferStatus,
    bybitTransferStatus,
    gateIoTransferStatus,
    solanaDexTransferStatus,
    topBinance,
    topOkx,
    topPerpPerp,
    topPerpPerpBybit,
    topPerpPerpGateIo,
    topOkxBybitPerp,
    topOkxGateIoPerp,
    topBybitGateIoPerp,
    topCrossExchange,
    topBithumbBinance,
    topBithumbBybit,
    topBithumbGateIo,
    topUpbitOkx,
    topUpbitBinance,
    topUpbitBybit,
    topUpbitGateIo,
    topBithumbSolanaDex,
  ]);
  const quickScanRows = useMemo(() => {
    return aggregatedOpportunityRows
      .filter((row) => row.opportunity.estimatedNetPct >= 2)
      .filter((row) => row.kind === "cex-cex" || row.kind === "cex-dex")
      .filter((row) => {
        const symbol = row.opportunity.symbol.replace("/KRW", "");
        const leftStatus = row.transferStatusConfig?.leftStatuses[symbol];
        const rightStatus = row.transferStatusConfig?.rightStatuses?.[symbol];

        if (!row.transferStatusConfig) {
          return false;
        }

        if (row.sourceTitle === "Upbit KRW vs Bithumb KRW") {
          return Boolean(bithumbTransferStatus[symbol]?.depositEnabled && bithumbTransferStatus[symbol]?.withdrawEnabled);
        }

        return (
          isTransferReadyForOpportunity(row.opportunity, row.transferStatusConfig.leftStatuses, row.transferStatusConfig.rightStatuses) &&
          getExecutionStatus(row.opportunity, leftStatus, rightStatus).label === "실행 가능"
        );
      })
      .sort((left, right) => right.opportunity.estimatedNetPct - left.opportunity.estimatedNetPct)
      .slice(0, 12);
  }, [aggregatedOpportunityRows, bithumbTransferStatus]);


  const recommendedActionRow = useMemo(() => {
    return quickScanRows[0] ?? null;
  }, [quickScanRows]);

  const heroActionRows = useMemo(() => {
    return quickScanRows.slice(0, 4);
  }, [quickScanRows]);

  const totalTrackedAssets = useMemo(() => {
    return new Set(aggregatedOpportunityRows.map((row) => row.opportunity.symbol)).size;
  }, [aggregatedOpportunityRows]);

  const currentYieldValue = recommendedActionRow?.opportunity.estimatedNetPct ?? 0;
  const currentRiskLabel =
    !recommendedActionRow
      ? "대기"
      : currentYieldValue >= 8
        ? "높음"
        : currentYieldValue >= 4
          ? "중간"
          : "낮음";

  const filteredOpportunityRows = useMemo(() => {
    return aggregatedOpportunityRows.filter((row) => {
      if (opportunityFilterKind !== "all" && row.kind !== opportunityFilterKind) {
        return false;
      }

      if (!opportunityExecutableOnly || !row.transferStatusConfig) {
        return true;
      }

      const transferSymbol = row.opportunity.symbol.replace("/KRW", "");
      const leftTransferStatus = row.transferStatusConfig.leftStatuses[transferSymbol];
      const rightTransferStatus = row.transferStatusConfig.rightStatuses?.[transferSymbol];
      return getExecutionStatus(row.opportunity, leftTransferStatus, rightTransferStatus).label === "실행 가능";
    });
  }, [aggregatedOpportunityRows, opportunityExecutableOnly, opportunityFilterKind]);

  const workflowTopCandidate = useMemo<WorkflowCandidate | null>(() => {
    const bestBinanceOpportunity = topBithumbBinance.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, binanceTransferStatus)
    );
    const bestOkxOpportunity = topCrossExchange.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus)
    );
    const bestBybitOpportunity = topBithumbBybit.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, bybitTransferStatus)
    );
    const bestGateIoOpportunity = topBithumbGateIo.find((opportunity) =>
      isTransferReadyForOpportunity(opportunity, bithumbTransferStatus, gateIoTransferStatus)
    );
    const bestBinance = bestBinanceOpportunity ? getWorkflowCandidate(bestBinanceOpportunity, "Bithumb -> Binance") : null;
    const bestOkx = bestOkxOpportunity ? getWorkflowCandidate(bestOkxOpportunity, "Bithumb -> OKX") : null;
    const bestBybit = bestBybitOpportunity ? getWorkflowCandidate(bestBybitOpportunity, "Bithumb -> Bybit") : null;
    const bestGateIo = bestGateIoOpportunity ? getWorkflowCandidate(bestGateIoOpportunity, "Bithumb -> Gate.io") : null;

    return [bestBinance, bestOkx, bestBybit, bestGateIo]
      .filter((candidate): candidate is WorkflowCandidate => candidate !== null)
      .sort((left, right) => right.estimatedNetPct - left.estimatedNetPct)[0] ?? null;
  }, [bithumbTransferStatus, binanceTransferStatus, bybitTransferStatus, gateIoTransferStatus, topBithumbBinance, topCrossExchange, topBithumbBybit, topBithumbGateIo]);

  const workflowNetworkState = useMemo(() => {
    if (!workflowCandidate) return null;

    const symbol = workflowCandidate.symbol.replace("/KRW", "");
    const bithumb = bithumbTransferStatus[symbol];
    const binance = binanceTransferStatus[symbol];
    const bybit = bybitTransferStatus[symbol];
    const gateIo = gateIoTransferStatus[symbol];
    const counterpartLabel = workflowCandidate.routeLabel.includes("Binance")
      ? "바이낸스"
      : workflowCandidate.routeLabel.includes("OKX")
        ? "OKX"
        : workflowCandidate.routeLabel.includes("Bybit")
          ? "Bybit"
          : workflowCandidate.routeLabel.includes("Gate.io")
            ? "Gate.io"
            : "상대 거래소";
    const counterpartStatus = workflowCandidate.routeLabel.includes("Binance")
      ? binance
      : workflowCandidate.routeLabel.includes("Bybit")
        ? bybit
        : workflowCandidate.routeLabel.includes("Gate.io")
          ? gateIo
          : undefined;
    const matchedNetworks = getMatchedNetworks(bithumb, counterpartStatus);

    return {
      symbol,
      counterpartLabel,
      bithumb,
      counterpartStatus,
      matchedNetworks,
    };
  }, [bithumbTransferStatus, binanceTransferStatus, bybitTransferStatus, gateIoTransferStatus, workflowCandidate]);

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

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTopButton(window.scrollY > 640);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!selectedChart || !lastUpdated) return;

    setSpreadHistoryByKey((current) => {
      const existing = current[selectedChart.key] ?? [];
      const nextPoint = {
        timestamp: lastUpdated,
        gapPct: selectedChart.gapPct,
        estimatedNetPct: selectedChart.estimatedNetPct,
      } satisfies SpreadHistoryPoint;

      if (existing[existing.length - 1]?.timestamp === nextPoint.timestamp) {
        return current;
      }

      return {
        ...current,
        [selectedChart.key]: [...existing, nextPoint].slice(-120),
      };
    });
  }, [lastUpdated, selectedChart]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <SideNavigation activeSection={activeSection} sections={NAVIGATION_SECTIONS} />
          <div className="space-y-8">
        <header id="overview" className="scroll-mt-24 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-cyan-950/20 lg:rounded-[32px] lg:p-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">GapGaps Live</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white lg:text-3xl">Cross-Exchange Opportunity Radar</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                바이낸스, 빗썸, 업비트, OKX, Bybit, Gate.io와 Solana DEX 시세를 3초마다 불러와 거래소 간 가격 차이를 스캔하고,
                지금 바로 볼 가치가 있는 실행 후보를 위쪽에 우선 배치하는 실시간 오퍼튜니티 보드입니다.
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

        <nav className="sticky top-3 z-30 -mx-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-3 backdrop-blur lg:hidden">
          <div className="flex min-w-max items-center gap-2">
            {[
              { href: "#overview", label: "개요" },
              { href: "#basis", label: "현선갭" },
              { href: "#perp-perp", label: "선선갭" },
              { href: "#cex-cex", label: "국내↔해외 CEX" },
              { href: "#cex-dex", label: "CEX↔DEX" },
              { href: "#matrix", label: "매트릭스" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">
            업데이트 {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "..."}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1">
            USDT/KRW {usdtKrwRate ? formatPrice(usdtKrwRate) : "-"}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1">
            실행 가능 {executableCrossExchangeCount.toLocaleString()}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1">
            DEX 후보 {solanaDexTickers.length.toLocaleString()}
          </span>
          <a href="#cex-cex" className="ml-auto rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100 transition hover:bg-cyan-400/20">
            상세 비교로 이동
          </a>
        </section>

        <section className="rounded-[28px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),rgba(15,23,42,0.94)_45%,rgba(2,6,23,0.98)_100%)] p-5 shadow-2xl shadow-cyan-950/20 lg:rounded-[32px] lg:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/65 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-100">Best Live Opportunity</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">Hero Route</span>
              </div>
              {recommendedActionRow ? (
                <>
                  <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{recommendedActionRow.sourceTitle}</span>
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">실행 가능</span>
                        <span className="rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300">{getOpportunityKindLabel(recommendedActionRow.kind)}</span>
                      </div>
                      <div className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">{recommendedActionRow.opportunity.symbol}</div>
                      <div className="mt-2 text-base text-slate-200 lg:text-lg">{recommendedActionRow.opportunity.buyExchange} → {recommendedActionRow.opportunity.sellExchange}</div>
                      <div className="mt-2 text-sm text-slate-400">지금 바로 확인할 최고 우선 후보. 전송 가능성과 자산 동일성 검증을 통과한 기회만 상단에 올립니다.</div>
                    </div>
                    <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 px-5 py-4 text-right">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-100/80">Est. Net</div>
                      <div className="mt-2 font-mono text-2xl font-semibold text-emerald-200 sm:text-3xl lg:text-4xl">{formatPct(recommendedActionRow.opportunity.estimatedNetPct)}</div>
                      <div className="mt-2 text-xs text-emerald-100/70">Gap {formatPct(recommendedActionRow.opportunity.gapPct)}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Buy leg</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">{recommendedActionRow.opportunity.buyExchange}</div>
                      <div className="mt-1 font-mono text-base text-white">{formatPrice(recommendedActionRow.opportunity.buyPrice)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Sell leg</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">{recommendedActionRow.opportunity.sellExchange}</div>
                      <div className="mt-1 font-mono text-base text-white">{formatPrice(recommendedActionRow.opportunity.sellPrice)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Market context</div>
                      <div className="mt-2 font-mono text-base text-white">USDT/KRW {usdtKrwRate ? formatPrice(usdtKrwRate) : "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">실시간 환산 기준 반영</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Risk profile</div>
                      <div className={`mt-2 text-base font-semibold ${currentRiskLabel === "높음" ? "text-rose-300" : currentRiskLabel === "중간" ? "text-amber-300" : "text-cyan-300"}`}>{currentRiskLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">현재 수익률 {formatPct(currentYieldValue)}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChart(getChartSelection(recommendedActionRow.sourceTitle, recommendedActionRow.opportunity));
                        document.getElementById(getRowTargetId(recommendedActionRow))?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
                    >
                      차트 + 상세 보기
                    </button>
                    <a href="#filtered-view" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100">
                      전체 액션 리스트 열기
                    </a>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-500">
                  현재 추천할 실행 가능 후보가 없습니다.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4 lg:rounded-[28px]">
                <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Status Strip</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                    <div className="text-[11px] text-slate-500">총 자산</div>
                    <div className="mt-1 font-mono text-2xl text-white">{totalTrackedAssets.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                    <div className="text-[11px] text-slate-500">실행 가능 루트</div>
                    <div className="mt-1 font-mono text-2xl text-emerald-300">{executableCrossExchangeCount.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                    <div className="text-[11px] text-slate-500">DEX 후보</div>
                    <div className="mt-1 font-mono text-2xl text-cyan-200">{solanaDexTickers.length.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                    <div className="text-[11px] text-slate-500">업데이트 상태</div>
                    <div className="mt-1 text-sm font-medium text-white">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "로딩 중"}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-cyan-300/70">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                      다음 갱신까지 {countdown}초
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4 lg:rounded-[28px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Action Feed</div>
                    <div className="mt-1 text-sm text-slate-400">지금 바로 볼 상위 실행 후보</div>
                  </div>
                  <div className="text-xs text-slate-500">TOP {heroActionRows.length}</div>
                </div>
                <div className="mt-4 space-y-3">
                  {heroActionRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-500">2% 이상 후보가 없습니다.</div>
                  ) : (
                    heroActionRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          setSelectedChart(getChartSelection(row.sourceTitle, row.opportunity));
                          document.getElementById(getRowTargetId(row))?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-white">{row.opportunity.symbol}</span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{getOpportunityKindLabel(row.kind)}</span>
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-400">{row.routeLabel}</div>
                            <div className="mt-2 text-[11px] text-slate-500">{row.sourceTitle}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono text-lg font-semibold ${row.opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(row.opportunity.estimatedNetPct)}</div>
                            <div className="mt-1 text-[11px] text-slate-500">Gap {formatPct(row.opportunity.gapPct)}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 lg:p-6">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Opportunity Feed</p>
              <h2 className="mt-2 text-xl font-semibold text-white">실행 가능한 상단 후보</h2>
              <p className="mt-1 text-sm text-slate-400">Hero 아래에서 바로 스캔할 수 있도록 핵심 후보만 카드형으로 노출합니다. 더 긴 리스트는 아래 Action List에서 확인하세요.</p>
            </div>
            <div className="text-xs text-slate-500">상위 12개</div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {quickScanRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-500">2% 이상 후보가 없습니다.</div>
            ) : (
              quickScanRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSelectedChart(getChartSelection(row.sourceTitle, row.opportunity));
                    document.getElementById(getRowTargetId(row))?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="w-full rounded-[24px] border border-white/10 bg-slate-950/60 px-4 py-4 text-left transition hover:border-cyan-300/30 hover:bg-slate-900"
                >
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-white">{row.opportunity.symbol}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">{getOpportunityKindLabel(row.kind)}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-300">{row.routeLabel}</div>
                      </div>
                      <div className={`text-right font-mono text-xl font-semibold ${row.opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(row.opportunity.estimatedNetPct)}</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Source</div>
                        <div className="mt-1 text-xs text-slate-200">{row.sourceTitle}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Buy</div>
                        <div className="mt-1 font-mono text-sm text-white">{formatPrice(row.opportunity.buyPrice)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sell</div>
                        <div className="mt-1 font-mono text-sm text-white">{formatPrice(row.opportunity.sellPrice)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>Gap {formatPct(row.opportunity.gapPct)}</span>
                      <span className="text-cyan-200">차트와 보드 열기 →</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <div className="font-medium text-amber-100">해외 spot은 USDT/KRW 환산 기준으로 KRW 비교</div>
            <div className="text-xs text-amber-100/90">{usdtKrwRate ? `1 USDT = ${formatPrice(usdtKrwRate)} KRW` : "환율 로딩 중"}</div>
          </div>
        </section>

        <section className="max-w-sm rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">브라우저 알림</h2>
              <p className="mt-1 text-xs text-slate-400">텔레그램 전 임시 알림용</p>
            </div>
            <CollapseButton collapsed={alertsCollapsed} onClick={() => setAlertsCollapsed((prev) => !prev)} />
          </div>
          {!alertsCollapsed ? (
            <div className="mt-4 space-y-3 text-xs text-slate-300">
              <div className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-center">
                Permission: {notificationPermission}
              </div>
              <button
                className="w-full rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
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
                className={`w-full rounded-full px-4 py-2 text-sm font-medium transition ${
                  notificationsEnabled ? "bg-emerald-500 text-white hover:bg-emerald-400" : "border border-white/10 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
                }`}
                onClick={() => setNotificationsEnabled((prev) => !prev)}
                disabled={notificationPermission !== "granted"}
              >
                {notificationsEnabled ? "알림 켜짐" : "알림 꺼짐"}
              </button>
            </div>
          ) : null}
        </section>

        <OpportunityChartPanel
          selection={selectedChart}
          history={selectedChart ? spreadHistoryByKey[selectedChart.key] ?? [] : []}
          onClear={() => setSelectedChart(null)}
        />

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

        <section id="filtered-view" className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Action Board</p>
              <h2 className="mt-2 text-xl font-semibold text-white">조치 필요 리스트</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">갭이 높은 순으로 우선 확인할 TOP 10만 보여줍니다. 목표치 이상이면 행 전체를 미세하게 강조합니다.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
                <div>현재 필터</div>
                <div className="mt-1 text-base font-semibold text-white">
                  {opportunityFilterKind === "all"
                    ? "전체"
                    : opportunityFilterKind === "basis"
                      ? "현선갭"
                      : opportunityFilterKind === "perp-perp"
                        ? "선선갭"
                        : opportunityFilterKind === "cex-cex"
                          ? "국내↔해외 CEX"
                          : "CEX-DEX"}
                </div>
              </div>
              <CollapseButton collapsed={filteredViewCollapsed} onClick={() => setFilteredViewCollapsed((prev) => !prev)} />
            </div>
          </div>

          {!filteredViewCollapsed ? (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">Target GAP 5.5%</span>
                <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">기본 노출 TOP 10</span>
                <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">현재 매칭 {filteredOpportunityRows.length}</span>
                {[
                  { key: "all", label: "전체" },
                  { key: "basis", label: "현선갭" },
                  { key: "perp-perp", label: "선선갭" },
                  { key: "cex-cex", label: "국내↔해외 CEX" },
                  { key: "cex-dex", label: "CEX-DEX" },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => {
                      setOpportunityFilterKind(filter.key as OpportunityFilterKind);
                      setShowAllActionRows(false);
                    }}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      opportunityFilterKind === filter.key
                        ? "border-cyan-400/30 bg-cyan-400/15 text-cyan-100"
                        : "border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={opportunityExecutableOnly}
                    onChange={(event) => {
                      setOpportunityExecutableOnly(event.target.checked);
                      setShowAllActionRows(false);
                    }}
                    className="accent-cyan-400"
                  />
                  실행 가능만 보기
                </label>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {filteredOpportunityRows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-slate-500 xl:col-span-2">
                    현재 필터에서 보여줄 기회가 없습니다.
                  </div>
                ) : (
                  (showAllActionRows ? filteredOpportunityRows : filteredOpportunityRows.slice(0, 10)).map((row) => {
                    const transferSymbol = row.opportunity.symbol.replace("/KRW", "");
                    const leftTransferStatus = row.transferStatusConfig?.leftStatuses[transferSymbol];
                    const rightTransferStatus = row.transferStatusConfig?.rightStatuses?.[transferSymbol];
                    const executionStatus = row.transferStatusConfig
                      ? getExecutionStatus(row.opportunity, leftTransferStatus, rightTransferStatus)
                      : { label: "참고용", tone: "border-white/10 bg-slate-900/80 text-slate-400" };
                    const boardMode = getOpportunityBoardMode(row.sourceTitle);
                    const crossPrices = getCrossMarketPrices(row.opportunity);
                    const foreignPriceMap = foreignPriceMapBySourceTitle[row.sourceTitle];
                    const foreignPrice = foreignPriceMap?.get(transferSymbol);
                    const executionReasons = row.transferStatusConfig
                      ? getExecutionReasons(row.opportunity, leftTransferStatus, rightTransferStatus)
                      : [];
                    const confidenceReasons = getConfidenceReasons(row.transferStatusConfig?.leftNotice, row.transferStatusConfig?.rightNotice);
                    const targetReached = row.opportunity.gapPct >= 5.5;
                    const formatBoardPrice = (exchangeLabel: string, value: number) => {
                      if (row.kind === "perp-perp") return formatOriginalPrice(value, "USDT");
                      if (exchangeLabel.includes("Bithumb") || exchangeLabel.includes("Upbit")) return formatPrice(value);
                      if (usdtKrwRate) return `${formatPrice(value * usdtKrwRate)} (${formatOriginalPrice(value, "USDT")})`;
                      return formatOriginalPrice(value, "USDT");
                    };

                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`group w-full rounded-[28px] border px-5 py-5 text-left transition ${targetReached ? "border-emerald-300/20 bg-emerald-400/5 hover:bg-emerald-400/10" : "border-white/10 bg-slate-950/35 hover:border-cyan-300/25 hover:bg-slate-900/70"}`}
                        onClick={() => {
                          setSelectedChart(getChartSelection(row.sourceTitle, row.opportunity));
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold text-white">{row.opportunity.symbol}</span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{getOpportunityKindLabel(row.kind)}</span>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${executionStatus.tone}`}>{executionStatus.label}</span>
                            </div>
                            <div className="mt-2 text-sm text-slate-200">{row.routeLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.sourceTitle}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono text-2xl font-semibold ${row.opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(row.opportunity.estimatedNetPct)}</div>
                            <div className={`mt-1 text-xs font-medium ${targetReached ? "text-emerald-200/80" : row.opportunity.gapPct >= 0 ? "text-slate-400" : "text-amber-300"}`}>Gap {formatPct(row.opportunity.gapPct)}</div>
                          </div>
                        </div>

                        {executionReasons.length > 0 || confidenceReasons.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {executionReasons.map((reason) => (
                              <span key={reason.label} className={`rounded-full border px-2.5 py-1 text-[11px] ${reason.tone}`}>
                                {reason.label}
                              </span>
                            ))}
                            {confidenceReasons.map((reason) => (
                              <span key={reason.label} className={`rounded-full border px-2.5 py-1 text-[11px] ${reason.tone}`}>
                                {reason.label}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Buy leg</div>
                            <div className="mt-2 text-xs text-slate-400">{row.opportunity.buyExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{formatBoardPrice(row.opportunity.buyExchange, row.opportunity.buyPrice)}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sell leg</div>
                            <div className="mt-2 text-xs text-slate-400">{row.opportunity.sellExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{boardMode === "krw-cross" && foreignPrice ? `${formatPrice(crossPrices.spotPrice)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})` : formatBoardPrice(row.opportunity.sellExchange, row.opportunity.sellPrice)}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
                          <div className="flex flex-wrap items-center gap-2 text-slate-500">
                            <span>클릭하면 차트와 보드로 이동</span>
                            {targetReached ? <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100">target hit</span> : null}
                          </div>
                          <span className="text-cyan-200 transition group-hover:translate-x-0.5">열기 →</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {filteredOpportunityRows.length > 10 ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllActionRows((prev) => !prev)}
                    className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2.5 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    {showAllActionRows ? "접기" : `더 보기 (${filteredOpportunityRows.length - 10}개)`}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <CollapsedSummary
              items={filteredOpportunityRows.slice(0, 3).map((row) => ({
                id: row.id,
                primary: `${row.opportunity.symbol} · ${row.sourceTitle}`,
                secondary: `${formatPct(row.opportunity.estimatedNetPct)} · ${row.routeLabel}`,
                accent: row.opportunity.gapPct >= 5.5 ? "text-emerald-300" : row.opportunity.estimatedNetPct > 0 ? "text-slate-200" : "text-rose-300",
              }))}
              emptyLabel="요약할 조치 필요 항목이 없습니다."
            />
          )}
        </section>
        <OpportunityChartPanel
          selection={selectedChart}
          history={selectedChart ? spreadHistoryByKey[selectedChart.key] ?? [] : []}
          onClear={() => setSelectedChart(null)}
        />

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

        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Market Explorer</p>
              <h2 className="mt-2 text-xl font-semibold text-white">통합 기회 리스트</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">섹션을 오가며 찾지 않고, 한 화면에서 필터만 바꿔가며 전체 기회를 훑는 메인 리스트입니다.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
              <div>현재 필터</div>
              <div className="mt-1 text-base font-semibold text-white">
                {opportunityFilterKind === "all"
                  ? "전체"
                  : opportunityFilterKind === "basis"
                    ? "현선갭"
                    : opportunityFilterKind === "perp-perp"
                      ? "선선갭"
                    : opportunityFilterKind === "cex-cex"
                      ? "국내↔해외 CEX"
                      : "CEX-DEX"}
              </div>
              <div className="mt-1 text-slate-500">{opportunityExecutableOnly ? "실행 가능만 보기" : "전체 상태 보기"}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { key: "all", label: "전체" },
              { key: "basis", label: "현선갭" },
              { key: "perp-perp", label: "선선갭" },
              { key: "cex-cex", label: "국내↔해외 CEX" },
              { key: "cex-dex", label: "CEX-DEX" },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setOpportunityFilterKind(filter.key as OpportunityFilterKind)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  opportunityFilterKind === filter.key
                    ? "border-cyan-400/30 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={opportunityExecutableOnly}
                onChange={(event) => setOpportunityExecutableOnly(event.target.checked)}
                className="accent-cyan-400"
              />
              실행 가능만 보기
            </label>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full table-fixed divide-y divide-white/10 text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  <th className="w-[220px] px-4 py-3 text-left font-medium">소스</th>
                  <th className="w-[130px] px-4 py-3 text-left font-medium">심볼</th>
                  <th className="w-[360px] px-4 py-3 text-left font-medium">경로 / 가격 / 네트워크</th>
                  <th className="w-[140px] px-4 py-3 text-left font-medium">실행 Gap</th>
                  <th className="w-[150px] px-4 py-3 text-left font-medium">예상 순수익</th>
                  <th className="px-4 py-3 text-left font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/30">
                {filteredOpportunityRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      현재 필터에서 보여줄 기회가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredOpportunityRows.slice(0, 40).map((row) => {
                    const transferSymbol = row.opportunity.symbol.replace("/KRW", "");
                    const leftTransferStatus = row.transferStatusConfig?.leftStatuses[transferSymbol];
                    const rightTransferStatus = row.transferStatusConfig?.rightStatuses?.[transferSymbol];
                    const executionStatus = row.transferStatusConfig
                      ? getExecutionStatus(row.opportunity, leftTransferStatus, rightTransferStatus)
                      : { label: "참고용", tone: "border-white/10 bg-slate-900/80 text-slate-400" };
                    const boardMode = getOpportunityBoardMode(row.sourceTitle);
                    const crossPrices = getCrossMarketPrices(row.opportunity);
                    const foreignPriceMap = foreignPriceMapBySourceTitle[row.sourceTitle];
                    const foreignPrice = foreignPriceMap?.get(transferSymbol);
                    const leftNetworkSummary = row.transferStatusConfig ? formatNetworkSummary(summarizeExecutableNetworks(leftTransferStatus)) : null;
                    const rightNetworkSummary = row.transferStatusConfig ? formatNetworkSummary(summarizeExecutableNetworks(rightTransferStatus)) : null;
                    const matchedNetworks =
                      row.transferStatusConfig && leftTransferStatus && rightTransferStatus
                        ? formatNetworkSummary(getMatchedNetworks(leftTransferStatus, rightTransferStatus))
                        : null;
                    const formatBoardPrice = (exchangeLabel: string, value: number) => {
                      if (row.kind === "perp-perp") {
                        return formatOriginalPrice(value, "USDT");
                      }
                      if (exchangeLabel.includes("Bithumb") || exchangeLabel.includes("Upbit")) {
                        return formatPrice(value);
                      }
                      if (usdtKrwRate) {
                        return `${formatPrice(value * usdtKrwRate)} (${formatOriginalPrice(value, "USDT")})`;
                      }
                      return formatOriginalPrice(value, "USDT");
                    };

                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer hover:bg-white/5"
                        onClick={() => {
                          setSelectedChart(getChartSelection(row.sourceTitle, row.opportunity));
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-white">{row.sourceTitle}</div>
                          <div className="mt-1 text-xs text-slate-500">{getOpportunityKindLabel(row.kind)}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">{row.opportunity.symbol}</td>
                        <td className="px-4 py-3 text-slate-300">
                          <div className="text-sm text-white">{row.routeLabel}</div>
                          <div className="mt-2 space-y-1.5 text-xs text-slate-400">
                            {boardMode === "krw-cross" ? (
                              <>
                                <div>
                                  {row.opportunity.buyExchange} {formatBoardPrice(row.opportunity.buyExchange, row.opportunity.buyPrice)}
                                </div>
                                <div>
                                  {row.opportunity.sellExchange}{" "}
                                  {foreignPrice
                                    ? `${formatPrice(crossPrices.spotPrice)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})`
                                    : formatBoardPrice(row.opportunity.sellExchange, row.opportunity.sellPrice)}
                                </div>
                              </>
                            ) : boardMode === "internal" ? (
                              <>
                                <div>{row.opportunity.buyExchange} {formatBoardPrice(row.opportunity.buyExchange, row.opportunity.buyPrice)}</div>
                                <div>{row.opportunity.sellExchange} {formatBoardPrice(row.opportunity.sellExchange, row.opportunity.sellPrice)}</div>
                              </>
                            ) : (
                              <>
                                <div>{row.opportunity.buyExchange} {formatBoardPrice(row.opportunity.buyExchange, row.opportunity.buyPrice)}</div>
                                <div>{row.opportunity.sellExchange} {formatBoardPrice(row.opportunity.sellExchange, row.opportunity.sellPrice)}</div>
                              </>
                            )}
                            {row.transferStatusConfig ? (
                              <>
                                <div className="pt-1 text-[11px] text-slate-500">
                                  {row.transferStatusConfig.leftExchangeLabel} 네트워크: {leftNetworkSummary}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {row.transferStatusConfig.rightExchangeLabel} 네트워크: {rightNetworkSummary}
                                </div>
                                <div className="text-[11px] text-cyan-200/80">
                                  공통 네트워크: {matchedNetworks && matchedNetworks !== "네트워크 정보 없음" ? matchedNetworks : "확인 불가"}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className={`px-4 py-3 font-mono tabular-nums ${row.opportunity.gapPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                          {formatPct(row.opportunity.gapPct)}
                        </td>
                        <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${row.opportunity.estimatedNetPct > 0 ? "text-emerald-400" : "text-rose-300"}`}>
                          {formatPct(row.opportunity.estimatedNetPct)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${executionStatus.tone}`}>{executionStatus.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <CategorySection
          id="basis"
          eyebrow="Basis Board"
          title="현선 갭 보드"
          description="같은 거래소 안에서 현물과 선물 가격이 얼마나 벌어지는지 보는 영역입니다. 내부 베이시스 확인과 헷지 아이디어 검토에 적합합니다."
        >
          <OpportunitySection
            title="Binance Spot vs Futures"
            description={binancePerpEnabled
              ? "같은 코인의 현물과 선물 가격 차이를 기준으로 내부 괴리를 정리합니다. 출금비, 슬리피지, 펀딩비는 포함하지 않은 참고용 지표입니다."
              : `현재 Binance 선물 API가 배포 환경에서 차단되어 비활성화 상태입니다. (${binancePerpError ?? "Binance perp unavailable"})`}
            opportunities={topBinance}
            loading={loading && binancePerpEnabled}
            marketMode="internal"
            leftMarketLabel="Spot Price"
            rightMarketLabel="Futures Price"
            onSelectChart={(opportunity) => setSelectedChart(getChartSelection("Binance Spot vs Futures", opportunity))}
            initialCollapsed
          />

          <OpportunitySection
            title="OKX Spot vs Perp"
            description="OKX 현물과 무기한 선물 가격 차이를 기준으로 예상 순수익을 계산합니다. 실제 거래 전에는 수수료와 펀딩비를 함께 확인해야 합니다."
            opportunities={topOkx}
            loading={loading}
            marketMode="internal"
            leftMarketLabel="Spot Price"
            rightMarketLabel="Perp Price"
            onSelectChart={(opportunity) => setSelectedChart(getChartSelection("OKX Spot vs Perp", opportunity))}
            initialCollapsed
          />
        </CategorySection>

        <CategorySection
          id="perp-perp"
          eyebrow="Perp Spread Board"
          title="선선 갭 보드"
          description="거래소 간 선물 가격 차이를 비교하는 영역입니다. 같은 코인의 무기한 계약 가격 괴리를 실행 기준으로 먼저 확인합니다."
        >
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-300/15 bg-slate-950/60 px-3 py-3">
            <span className="text-xs font-medium text-slate-400">바로가기</span>
            {[
              { href: '#perp-binance-okx', label: 'Binance ↔ OKX' },
              { href: '#perp-binance-bybit', label: 'Binance ↔ Bybit' },
              { href: '#perp-binance-gateio', label: 'Binance ↔ Gate.io' },
              { href: '#perp-okx-bybit', label: 'OKX ↔ Bybit' },
              { href: '#perp-okx-gateio', label: 'OKX ↔ Gate.io' },
              { href: '#perp-bybit-gateio', label: 'Bybit ↔ Gate.io' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div id="perp-binance-okx" className="scroll-mt-28">
            <OpportunitySection
              title="Binance Perp vs OKX Swap"
              description="바이낸스 무기한 선물과 OKX 스왑 가격을 같은 기준으로 비교합니다. 거래소 간 선물 괴리와 체결 가능 갭을 보는 1차 선선갭 섹션입니다."
              opportunities={topPerpPerp}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("Binance Perp vs OKX Swap", opportunity))}
              initialCollapsed
            />
          </div>
          <div id="perp-binance-bybit" className="scroll-mt-28">
            <OpportunitySection
              title="Binance Perp vs Bybit Perp"
              description="바이낸스와 Bybit 무기한 선물 가격 차이를 비교합니다. 해외 선물 거래소 간 괴리를 빠르게 스캔할 수 있습니다."
              opportunities={topPerpPerpBybit}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("Binance Perp vs Bybit Perp", opportunity))}
              initialCollapsed
            />
          </div>
          <div id="perp-binance-gateio" className="scroll-mt-28">
            <OpportunitySection
              title="Binance Perp vs Gate.io Perp"
              description="바이낸스와 Gate.io 무기한 선물 가격 차이를 비교합니다. 보조 거래소 선선갭을 넓게 보는 용도입니다."
              opportunities={topPerpPerpGateIo}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("Binance Perp vs Gate.io Perp", opportunity))}
              initialCollapsed
            />
          </div>
          <div id="perp-okx-bybit" className="scroll-mt-28">
            <OpportunitySection
              title="OKX Swap vs Bybit Perp"
              description="OKX와 Bybit 무기한 선물 가격 차이를 비교합니다. 바이낸스 축 외에 주요 해외 선물 거래소끼리의 괴리를 확인합니다."
              opportunities={topOkxBybitPerp}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("OKX Swap vs Bybit Perp", opportunity))}
              initialCollapsed
            />
          </div>
          <div id="perp-okx-gateio" className="scroll-mt-28">
            <OpportunitySection
              title="OKX Swap vs Gate.io Perp"
              description="OKX와 Gate.io 무기한 선물 가격 차이를 비교합니다. 거래소 간 선선갭을 더 촘촘하게 확인하는 보조 섹션입니다."
              opportunities={topOkxGateIoPerp}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("OKX Swap vs Gate.io Perp", opportunity))}
              initialCollapsed
            />
          </div>
          <div id="perp-bybit-gateio" className="scroll-mt-28">
            <OpportunitySection
              title="Bybit Perp vs Gate.io Perp"
              description="Bybit와 Gate.io 무기한 선물 가격 차이를 비교합니다. 바이낸스를 제외한 선물 거래소 간 갭까지 한 번에 스캔할 수 있습니다."
              opportunities={topBybitGateIoPerp}
              loading={loading}
              marketMode="cross"
              onSelectChart={(opportunity) => setSelectedChart(getChartSelection("Bybit Perp vs Gate.io Perp", opportunity))}
              initialCollapsed
            />
          </div>
        </CategorySection>

        <CategorySection
          id="cex-cex"
          eyebrow="Domestic Premium Routes"
          title="국내↔해외 CEX"
          description="국내 원화 거래소를 먼저 보고, 그 다음 해외 CEX 현물과 비교하는 구조로 정리했습니다. 빗썸과 업비트를 각각 기준축으로 두고 같은 조건에서 해외 가격을 비교합니다."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">국내 CEX</div>
              <div className="mt-2 text-sm font-semibold text-white">빗썸 / 업비트</div>
              <div className="mt-1 text-xs text-slate-400">원화 기준으로 먼저 보고, 실제 호가 기준 갭을 비교합니다.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">해외 CEX</div>
              <div className="mt-2 text-sm font-semibold text-white">Binance / OKX / Bybit / Gate.io</div>
              <div className="mt-1 text-xs text-slate-400">USDT 마켓을 KRW로 환산해 같은 기준에서 비교합니다.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">국내 기준 1</div>
                <div className="mt-1 text-lg font-semibold text-white">빗썸 KRW 기준 비교</div>
                <div className="mt-1 text-sm text-slate-400">현재까지 입출금/네트워크 상태를 가장 많이 확인할 수 있는 국내 비교축입니다.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-300/15 bg-slate-950/60 px-3 py-3">
                <span className="text-xs font-medium text-slate-400">바로가기</span>
                {[
                  { href: '#bithumb-okx', label: '빗썸 → OKX' },
                  { href: '#bithumb-binance', label: '빗썸 → 바이낸스' },
                  { href: '#bithumb-bybit', label: '빗썸 → Bybit' },
                  { href: '#bithumb-gateio', label: '빗썸 → Gate.io' },
                  { href: '#upbit-okx', label: '업비트 → OKX' },
                  { href: '#upbit-binance', label: '업비트 → 바이낸스' },
                  { href: '#upbit-bybit', label: '업비트 → Bybit' },
                  { href: '#upbit-gateio', label: '업비트 → Gate.io' },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div id="bithumb-okx" className="scroll-mt-28">
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
          </div>

          <div id="bithumb-binance" className="scroll-mt-28">
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
          </div>

          <div id="bithumb-bybit" className="scroll-mt-28">
          <OpportunitySection
            title="Bithumb KRW vs Bybit Spot"
            description="빗썸 원화 마켓과 Bybit USDT 마켓을 같은 KRW 기준으로 비교합니다. 다만 Bybit는 현재 공개 엔드포인트만 사용 중이라 실제 입출금 가능 상태는 확인 불가로 표시합니다."
            opportunities={topBithumbBybit}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={bybitSpotPriceMap}
            workflowCandidateId={workflowCandidate?.id ?? null}
            onPromoteToWorkflow={(opportunity) => {
              setWorkflowMode("manual");
              setWorkflowCandidate(getWorkflowCandidate(opportunity, "Bithumb -> Bybit"));
              setWorkflowStep("detected");
              setWorkflowQuantity("");
              setWorkflowUpdatedAt(Date.now());
            }}
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "Bybit",
              rightStatuses: bybitTransferStatus,
              rightNotice: "Bybit transfer status unavailable",
            }}
          />
          </div>

          <div id="bithumb-gateio" className="scroll-mt-28">
          <OpportunitySection
            title="Bithumb KRW vs Gate.io Spot"
            description="빗썸 원화 마켓과 Gate.io USDT 마켓을 같은 KRW 기준으로 비교합니다. 해외 현물 가격 분산을 더 넓게 볼 수 있습니다."
            opportunities={topBithumbGateIo}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={gateIoSpotPriceMap}
            workflowCandidateId={workflowCandidate?.id ?? null}
            onPromoteToWorkflow={(opportunity) => {
              setWorkflowMode("manual");
              setWorkflowCandidate(getWorkflowCandidate(opportunity, "Bithumb -> Gate.io"));
              setWorkflowStep("detected");
              setWorkflowQuantity("");
              setWorkflowUpdatedAt(Date.now());
            }}
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "Gate.io",
              rightStatuses: gateIoTransferStatus,
            }}
          />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">국내 기준 2</div>
            <div className="mt-1 text-lg font-semibold text-white">업비트 KRW 기준 비교</div>
            <div className="mt-1 text-sm text-slate-400">업비트는 공개 가격과 호가는 반영하고, 전송 상태는 공개 API 한계로 안내 배지로 표시합니다.</div>
          </div>

          <div id="upbit-bithumb" className="scroll-mt-28">
          <OpportunitySection
            title="Upbit KRW vs Bithumb KRW"
            description="국내 원화 거래소끼리 직접 가격 차이를 비교합니다. 같은 KRW 마켓 기준이라 환산 없이 바로 차액을 볼 수 있고, 실제 전송 상태는 업비트 공개 API 한계로 참고용으로 해석합니다."
            opportunities={topUpbitBithumb}
            loading={loading}
            marketMode="cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="KRW Price"
            initialCollapsed
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "업비트",
              leftStatuses: {},
              leftNotice: "업비트 공개 전송 상태 미지원",
              rightExchangeLabel: "빗썸",
              rightStatuses: bithumbTransferStatus,
            }}
          />
          </div>

          <div id="upbit-okx" className="scroll-mt-28">
          <OpportunitySection
            title="Upbit KRW vs OKX Spot"
            description="업비트 원화 마켓과 OKX 현물 가격을 USDT/KRW 환율로 맞춰 비교합니다. 업비트 전송 상태는 공개 API 미지원이라 참고용 가격 비교에 초점을 둡니다."
            opportunities={topUpbitOkx}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={okxSpotPriceMap}
            initialCollapsed
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "업비트",
              leftStatuses: {},
              leftNotice: "업비트 공개 전송 상태 미지원",
              rightExchangeLabel: "OKX",
              rightNotice: "OKX 공개 전송 상태 미지원",
            }}
          />
          </div>

          <div id="upbit-binance" className="scroll-mt-28">
          <OpportunitySection
            title="Upbit KRW vs Binance Spot"
            description="업비트 원화 마켓과 바이낸스 USDT 마켓을 같은 KRW 기준으로 비교합니다. 가격 괴리는 바로 볼 수 있지만 업비트 전송 상태는 별도 확인이 필요합니다."
            opportunities={topUpbitBinance}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={binanceSpotPriceMap}
            initialCollapsed
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "업비트",
              leftStatuses: {},
              leftNotice: "업비트 공개 전송 상태 미지원",
              rightExchangeLabel: "바이낸스",
              rightStatuses: binanceTransferStatus,
            }}
          />
          </div>

          <div id="upbit-bybit" className="scroll-mt-28">
          <OpportunitySection
            title="Upbit KRW vs Bybit Spot"
            description="업비트 원화 마켓과 Bybit USDT 마켓을 같은 KRW 기준으로 비교합니다. 가격은 비교 가능하지만 양쪽 모두 전송 상태는 공개 정보가 제한적입니다."
            opportunities={topUpbitBybit}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={bybitSpotPriceMap}
            initialCollapsed
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "업비트",
              leftStatuses: {},
              leftNotice: "업비트 공개 전송 상태 미지원",
              rightExchangeLabel: "Bybit",
              rightStatuses: bybitTransferStatus,
              rightNotice: "Bybit transfer status unavailable",
            }}
          />
          </div>

          <div id="upbit-gateio" className="scroll-mt-28">
          <OpportunitySection
            title="Upbit KRW vs Gate.io Spot"
            description="업비트 원화 마켓과 Gate.io USDT 마켓을 같은 KRW 기준으로 비교합니다. 국내 원화축을 업비트로 바꿔 봐야 할 때 참고하기 좋습니다."
            opportunities={topUpbitGateIo}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="Spot Price"
            foreignPriceMap={gateIoSpotPriceMap}
            initialCollapsed
            workflowPromotionDisabledReason="상태 미확인"
            transferStatusConfig={{
              leftExchangeLabel: "업비트",
              leftStatuses: {},
              leftNotice: "업비트 공개 전송 상태 미지원",
              rightExchangeLabel: "Gate.io",
              rightStatuses: gateIoTransferStatus,
            }}
          />
          </div>
        </CategorySection>

        <CategorySection
          id="cex-dex"
          eyebrow="CEX-DEX Routes"
          title="CEX↔DEX 루트"
          description="중앙화 거래소 현물과 DEX 현물 가격을 비교하는 영역입니다. 체인 호환성과 입출금 상태를 먼저 보고, 그 다음 가격 차이를 해석하는 흐름에 맞췄습니다."
        >
          <div className="mb-4 rounded-3xl border border-white/10 bg-slate-950/35 p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Execution Diagnostics</p>
                <h3 className="mt-2 text-lg font-semibold text-white">DEX route readiness</h3>
                <p className="mt-1 text-sm text-slate-400">먼저 체인/입출금 조건을 통과한 토큰만 위로 올리고, 나머지는 아래 진단 레이어에서 확인하도록 분리했습니다.</p>
              </div>
              <div className="text-xs text-slate-500">참고 레이어</div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SummaryCard
                label="Executable"
                value={solanaDexExecutionRows.filter((row) => row.status === "executable").length.toLocaleString()}
                hint="빗썸과 Solana 공통 네트워크 입출금 가능"
              />
              <SummaryCard
                label="Reference only"
                value={solanaDexExecutionRows.filter((row) => row.status === "reference-only").length.toLocaleString()}
                hint="공통 네트워크는 있으나 상태 미완전"
              />
              <SummaryCard
                label="Blocked"
                value={solanaDexExecutionRows.filter((row) => row.status === "blocked").length.toLocaleString()}
                hint="공통 네트워크가 없어 비교 제외"
              />
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/28">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="text-sm font-semibold text-white">DEX 실행 가능성 점검</div>
              <div className="mt-1 text-xs text-slate-500">가격 비교 전에 빗썸과 Solana 네트워크가 실제로 맞는 토큰만 먼저 추립니다. 아래 표는 액션 영역 바깥의 진단 참고용입니다.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-300">
                <thead className="bg-white/5 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">토큰</th>
                    <th className="px-4 py-3 font-medium">체인 / 주소</th>
                    <th className="px-4 py-3 font-medium">공통 네트워크</th>
                    <th className="px-4 py-3 font-medium">입출금</th>
                    <th className="px-4 py-3 font-medium">판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {solanaDexExecutionRows.map((row) => {
                    const tone =
                      row.status === "executable"
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        : row.status === "reference-only"
                          ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
                          : "border-rose-400/20 bg-rose-500/10 text-rose-200";

                    return (
                      <tr key={row.symbol}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{row.symbol}</div>
                          {row.liquidityUsd ? <div className="mt-1 text-[11px] text-slate-500">Liquidity ${row.liquidityUsd.toLocaleString()}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{row.chainLabel}</td>
                        <td className="px-4 py-3 text-slate-400">{row.matchedNetworkSummary}</td>
                        <td className="px-4 py-3 text-slate-400">출금 {row.withdrawEnabled ? "가능" : "불가"} · 입금 {row.depositEnabled ? "가능" : "불가"}</td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{row.reason}</div>
                          <div className="mt-1 text-[11px] text-slate-500">code: {row.executionCode}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <OpportunitySection
            title="Bithumb KRW vs Solana DEX"
            description="실행 가능 판정을 통과한 Solana 토큰만 빗썸과 비교합니다. 즉 가격차보다 먼저 공통 네트워크 조건을 통과한 후보만 보입니다."
            opportunities={topBithumbSolanaDex}
            loading={loading}
            marketMode="krw-cross"
            leftMarketLabel="KRW Price"
            rightMarketLabel="DEX Price"
            foreignPriceMap={solanaDexPriceMap}
            initialCollapsed
            transferStatusConfig={{
              leftExchangeLabel: "빗썸",
              leftStatuses: bithumbTransferStatus,
              rightExchangeLabel: "Solana DEX",
              rightStatuses: solanaDexTransferStatus,
            }}
          />
        </CategorySection>

        <section id="matrix" className="scroll-mt-24 rounded-3xl border border-white/10 bg-slate-950/35 p-6 shadow-xl shadow-slate-950/20">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Reference Layer</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Full Market Scan Matrix</h2>
              <p className="mt-1 text-sm text-slate-400">
                빗썸 KRW, 업비트 KRW, OKX Spot, Binance Spot, Bybit Spot, Gate.io Spot 가격을 모두 KRW 기준으로 비교합니다. 이 영역은 실행 후보를 고른 뒤 전체 시장 분포를 확인하는 참고 레이어입니다.
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
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        {loading ? "시세 데이터를 불러오는 중..." : "비교 가능한 가격 데이터가 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    sortedPriceMatrixRows.map((row) => (
                      <tr key={row.base} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-medium text-white">{row.base}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.bithumbKrw ? formatPrice(row.bithumbKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.upbitKrw ? formatPrice(row.upbitKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.okxKrw ? formatPrice(row.okxKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.binanceKrw ? formatPrice(row.binanceKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.bybitKrw ? formatPrice(row.bybitKrw) : "-"}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{row.gateioKrw ? formatPrice(row.gateioKrw) : "-"}</td>
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

        {showScrollTopButton ? (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-5 right-5 z-40 rounded-full border border-cyan-300/20 bg-slate-950/90 px-4 py-3 text-sm font-medium text-cyan-100 shadow-2xl shadow-black/30 backdrop-blur transition hover:bg-cyan-400/15"
          >
            ↑ 위로 가기
          </button>
        ) : null}
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
  onSelectChart,
  transferStatusConfig,
  workflowPromotionDisabledReason,
  initialCollapsed = false,
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
  onSelectChart?: (opportunity: ArbitrageOpportunity) => void;
  transferStatusConfig?: {
    leftExchangeLabel: string;
    leftStatuses: TransferStatusMap;
    rightExchangeLabel: string;
    rightStatuses?: TransferStatusMap;
    leftNotice?: string;
    rightNotice?: string;
  };
  workflowPromotionDisabledReason?: string;
  initialCollapsed?: boolean;
}) {
  const [sortConfig] = useState<SortConfig<OpportunitySortKey>>({ key: "estimatedNetPct", direction: "asc" });
  const [orderLock, setOrderLock] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const hasTransferStatus = Boolean(transferStatusConfig);

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

  const collapsedSummaryOpportunities = useMemo(() => {
    if (!hasTransferStatus) return sortedOpportunities;

    return sortedOpportunities.filter((opportunity) => {
      const transferSymbol = opportunity.symbol.replace("/KRW", "");
      const leftTransferStatus = transferStatusConfig?.leftStatuses[transferSymbol];
      const rightTransferStatus = transferStatusConfig?.rightStatuses?.[transferSymbol];
      const executionStatus = getExecutionStatus(opportunity, leftTransferStatus, rightTransferStatus);
      return executionStatus.label !== "입출금 불가";
    });
  }, [hasTransferStatus, sortedOpportunities, transferStatusConfig]);

  useEffect(() => {
    if (orderLock || opportunities.length === 0) return;
    setOrderLock(sortOpportunityRows(opportunities, sortConfig, marketMode).map((item) => `${item.symbol}:${item.buyExchange}:${item.sellExchange}`));
  }, [marketMode, opportunities, orderLock, sortConfig]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Preview Board</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">Polling every {POLL_INTERVAL_MS / 1000}s</span>
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((prev) => !prev)} />
        </div>
      </div>

      {!collapsed ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-3 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">정렬 기준 {sortConfig.key}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">방향 {sortConfig.direction === "asc" ? "오름차순" : "내림차순"}</span>
            {marketMode === "internal" ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Basis board</span> : null}
            {marketMode === "krw-cross" ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Domestic/global board</span> : null}
            {marketMode === "cross" ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Cross-exchange board</span> : null}
          </div>

          {sortedOpportunities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-slate-400">
              {loading ? "시세 데이터를 불러오는 중..." : "현재 조건에 맞는 차익거래 기회가 없습니다."}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {sortedOpportunities.map((opportunity) => {
                const { spotPrice, futuresPrice } = getInternalMarketPrices(opportunity);
                const { krwPrice, spotPrice: foreignSpotKrwPrice } = getCrossMarketPrices(opportunity);
                const foreignPrice = foreignPriceMap?.get(opportunity.symbol.replace("/KRW", ""));
                const transferSymbol = opportunity.symbol.replace("/KRW", "");
                const leftTransferStatus = transferStatusConfig?.leftStatuses[transferSymbol];
                const rightTransferStatus = transferStatusConfig?.rightStatuses?.[transferSymbol];
                const leftNetworkSummary = formatNetworkSummary(summarizeExecutableNetworks(leftTransferStatus));
                const rightNetworkSummary = formatNetworkSummary(summarizeExecutableNetworks(rightTransferStatus));
                const executionStatus = hasTransferStatus ? getExecutionStatus(opportunity, leftTransferStatus, rightTransferStatus) : null;
                const executionReasons = hasTransferStatus ? getExecutionReasons(opportunity, leftTransferStatus, rightTransferStatus) : [];
                const confidenceReasons = getConfidenceReasons(transferStatusConfig?.leftNotice, transferStatusConfig?.rightNotice);
                const routeLabel = getOpportunityRouteLabel(title);
                const candidateId = getWorkflowCandidate(opportunity, routeLabel).id;
                const isWorkflowSelected = workflowCandidateId === candidateId;
                const renderCrossExchangePrice = (exchangeLabel: string, price: number) => {
                  const isForeignExchange = exchangeLabel !== "Bithumb Spot" && exchangeLabel !== "Upbit Spot" && Boolean(foreignPrice);
                  if (!isForeignExchange || !foreignPrice) return formatPrice(price);
                  return `${formatPrice(price)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})`;
                };

                return (
                  <div
                    key={`${title}-${opportunity.symbol}-${opportunity.buyExchange}-${opportunity.sellExchange}`}
                    className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5 transition hover:border-cyan-300/25 hover:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-white">{opportunity.symbol}</span>
                          {executionStatus ? <span className={`rounded-full border px-2.5 py-1 text-[11px] ${executionStatus.tone}`}>{executionStatus.label}</span> : null}
                        </div>
                        <div className="mt-2 text-sm text-slate-200">{opportunity.buyExchange} → {opportunity.sellExchange}</div>
                        <div className="mt-1 text-xs text-slate-500">{routeLabel}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-2xl font-semibold ${opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(opportunity.estimatedNetPct)}</div>
                        <div className={`mt-1 text-xs ${opportunity.gapPct >= 0 ? "text-slate-400" : "text-amber-300"}`}>Gap {formatPct(opportunity.gapPct)}</div>
                      </div>
                    </div>

                    {executionReasons.length > 0 || confidenceReasons.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {executionReasons.map((reason) => (
                          <span key={reason.label} className={`rounded-full border px-2.5 py-1 text-[11px] ${reason.tone}`}>
                            {reason.label}
                          </span>
                        ))}
                        {confidenceReasons.map((reason) => (
                          <span key={reason.label} className={`rounded-full border px-2.5 py-1 text-[11px] ${reason.tone}`}>
                            {reason.label}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {marketMode === "internal" ? (
                        <>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{leftMarketLabel}</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.buyExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{formatPrice(spotPrice)}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{rightMarketLabel}</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.sellExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{formatPrice(futuresPrice)}</div>
                          </div>
                        </>
                      ) : marketMode === "krw-cross" ? (
                        <>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Buy leg</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.buyExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{formatPrice(krwPrice)}</div>
                            {hasTransferStatus ? <div className="mt-1 text-[11px] text-slate-500">{transferStatusConfig?.leftExchangeLabel} 네트워크: {leftNetworkSummary}</div> : null}
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sell leg</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.sellExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{foreignPrice ? `${formatPrice(foreignSpotKrwPrice)} (${formatOriginalPrice(foreignPrice.price, foreignPrice.quote)})` : formatPrice(foreignSpotKrwPrice)}</div>
                            {hasTransferStatus ? <div className="mt-1 text-[11px] text-slate-500">{transferStatusConfig?.rightExchangeLabel} 네트워크: {rightNetworkSummary}</div> : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Buy exchange</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.buyExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{renderCrossExchangePrice(opportunity.buyExchange, opportunity.buyPrice)}</div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sell exchange</div>
                            <div className="mt-2 text-xs text-slate-400">{opportunity.sellExchange}</div>
                            <div className="mt-1 font-mono text-sm text-white">{renderCrossExchangePrice(opportunity.sellExchange, opportunity.sellPrice)}</div>
                          </div>
                        </>
                      )}
                    </div>

                    {hasTransferStatus ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-300">
                        <div className="flex flex-col gap-2">
                          <TransferStatusLine exchangeLabel={transferStatusConfig?.leftExchangeLabel ?? ""} status={leftTransferStatus} />
                          {transferStatusConfig?.leftNotice ? <TransferNoticeBadge text={transferStatusConfig.leftNotice} /> : null}
                          <TransferStatusLine exchangeLabel={transferStatusConfig?.rightExchangeLabel ?? ""} status={rightTransferStatus} />
                          {transferStatusConfig?.rightNotice ? <TransferNoticeBadge text={transferStatusConfig.rightNotice} /> : null}
                        </div>
                      </div>
                    ) : null}

                    {(foreignPrice?.dexId || foreignPrice?.tokenAddress) && marketMode === "krw-cross" ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] text-slate-500">
                        {foreignPrice?.dexId ? <div>DEX: {foreignPrice.dexId}{formatLiquidityUsd(foreignPrice.liquidityUsd) ? ` · 유동성 ${formatLiquidityUsd(foreignPrice.liquidityUsd)}` : ""}</div> : null}
                        {foreignPrice?.tokenAddress ? <div className="mt-1">민트: {formatShortAddress(foreignPrice.tokenAddress)}</div> : null}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {onSelectChart ? (
                        <button
                          type="button"
                          onClick={() => onSelectChart(opportunity)}
                          className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                        >
                          차트 보기
                        </button>
                      ) : null}
                      {onPromoteToWorkflow ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!workflowPromotionDisabledReason) onPromoteToWorkflow(opportunity);
                          }}
                          disabled={Boolean(workflowPromotionDisabledReason)}
                          className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                            workflowPromotionDisabledReason
                              ? "cursor-not-allowed border-white/10 bg-slate-900/50 text-slate-500"
                              : isWorkflowSelected
                              ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                              : "border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {workflowPromotionDisabledReason ? workflowPromotionDisabledReason : isWorkflowSelected ? "현재 승인 후보" : "이 후보로 진행"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <CollapsedSummary
          items={collapsedSummaryOpportunities.slice(0, 3).map((opportunity) => ({
            id: `${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
            primary: opportunity.symbol,
            secondary:
              marketMode === "internal"
                ? `${leftMarketLabel} / ${rightMarketLabel} ${formatPct(opportunity.gapPct)}`
                : `${opportunity.buyExchange} -> ${opportunity.sellExchange} ${formatPct(opportunity.estimatedNetPct)}`,
            accent: opportunity.estimatedNetPct > 0 ? "text-emerald-300" : "text-rose-300",
          }))}
          emptyLabel={loading ? "시세 데이터를 불러오는 중..." : "카드로 보여줄 실행 가능 기회가 없습니다."}
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

function TransferNoticeBadge({ text }: { text: string }) {
  return <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100">{text}</span>;
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-slate-950/20">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function getExchangeAccentColor(exchange: string) {
  if (exchange.includes("Upbit")) return "#60a5fa";
  if (exchange.includes("Binance")) return "#34d399";
  if (exchange.includes("Bithumb")) return "#f59e0b";
  if (exchange.includes("OKX")) return "#a78bfa";
  if (exchange.includes("Bybit")) return "#f472b6";
  if (exchange.includes("Gate.io")) return "#22d3ee";
  return "#94a3b8";
}

function OpportunityChartPanel({ selection, history, onClear }: { selection: ChartSelection | null; history: SpreadHistoryPoint[]; onClear: () => void }) {
  const [timeframe, setTimeframe] = useState<"1m" | "3m" | "5m" | "15m" | "1h">("5m");
  const timeframeOptions: Array<{ key: "1m" | "3m" | "5m" | "15m" | "1h"; label: string; points: number; interval: string }> = [
    { key: "1m", label: "1분", points: 20, interval: "1" },
    { key: "3m", label: "3분", points: 40, interval: "3" },
    { key: "5m", label: "5분", points: 60, interval: "5" },
    { key: "15m", label: "15분", points: 90, interval: "15" },
    { key: "1h", label: "1시간", points: 120, interval: "60" },
  ];
  const selectedWindow = timeframeOptions.find((option) => option.key === timeframe) ?? timeframeOptions[2];
  const fallbackPoint = selection ? [{ timestamp: Date.now(), gapPct: selection.gapPct, estimatedNetPct: selection.estimatedNetPct }] : [];
  const baseHistory = history.length > 1 ? history : fallbackPoint;
  const visibleHistory = baseHistory.slice(-selectedWindow.points);
  const spreadExpression = selection ? getTradingViewSpreadExpression(selection.legs) : null;
  const latestPoint = visibleHistory[visibleHistory.length - 1] ?? null;
  const latestGap = latestPoint?.gapPct ?? selection?.gapPct ?? 0;
  const latestNet = latestPoint?.estimatedNetPct ?? selection?.estimatedNetPct ?? 0;
  const targetGap = 5.5;

  const renderGapChart = (values: number[]) => {
    const width = 720;
    const height = 260;
    const paddingX = 24;
    const paddingY = 20;
    const min = Math.min(...values, targetGap, 0);
    const max = Math.max(...values, targetGap, 0);
    const range = max - min || 1;
    const toX = (index: number) => paddingX + (index / Math.max(values.length - 1, 1)) * (width - paddingX * 2);
    const toY = (value: number) => height - paddingY - ((value - min) / range) * (height - paddingY * 2);
    const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${toX(index)},${toY(value)}`).join(" ");
    const targetY = toY(targetGap);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={`h-[260px] w-full rounded-3xl border border-white/10 ${latestGap >= targetGap ? "bg-emerald-400/8" : "bg-white/[0.02]"}`}>
        {[0.2, 0.5, 0.8].map((ratio) => (
          <line
            key={ratio}
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingY + (height - paddingY * 2) * ratio}
            y2={paddingY + (height - paddingY * 2) * ratio}
            stroke="rgba(148,163,184,0.12)"
            strokeDasharray="3 6"
          />
        ))}
        <line x1={paddingX} x2={width - paddingX} y1={targetY} y2={targetY} stroke="rgba(244,114,182,0.9)" strokeDasharray="8 6" />
        <path d={path} fill="none" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => (
          <circle key={`${index}-${value}`} cx={toX(index)} cy={toY(value)} r="2.5" fill="#34d399" opacity={index === values.length - 1 ? 1 : 0.25} />
        ))}
      </svg>
    );
  };

  if (!selection) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">통합 진단 차트</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Price / Gap 진단</h2>
            <p className="mt-1 text-sm text-slate-400">표에서 원하는 후보를 누르면 가격과 갭 진단 차트를 함께 보여줍니다.</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-8 text-sm text-slate-500">
          차트를 보려면 표에서 원하는 행을 클릭하세요.
        </div>
      </section>
    );
  }

  const leftColor = getExchangeAccentColor(selection.legs[0].exchange);
  const rightColor = getExchangeAccentColor(selection.legs[1].exchange);
  const gapValues = visibleHistory.map((point) => point.gapPct);

  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a1020] p-6 shadow-2xl shadow-slate-950/30">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">통합 진단 차트</p>
          <h2 className="mt-2 text-lg font-semibold text-white">{selection.symbol} · Price / Gap 진단</h2>
          <p className="mt-1 text-sm text-slate-400">{selection.title} · {selection.routeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          차트 닫기
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {timeframeOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTimeframe(option.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              timeframe === option.key
                ? "bg-white text-slate-950"
                : "border border-white/10 bg-[#111827] text-slate-300 hover:bg-slate-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Price Chart</div>
              <div className="mt-1 text-[11px] text-slate-400">거래소별 가격 차이 진단</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-3 py-1 text-[11px] font-semibold text-slate-950" style={{ backgroundColor: leftColor }}>{selection.legs[0].exchange}</span>
              <span className="rounded-full px-3 py-1 text-[11px] font-semibold text-slate-950" style={{ backgroundColor: rightColor }}>{selection.legs[1].exchange}</span>
            </div>
          </div>
          {spreadExpression ? (
            <iframe
              key={`${spreadExpression}-${selectedWindow.interval}`}
              src={getTradingViewEmbedUrl(spreadExpression, selectedWindow.interval)}
              title={`${selection.symbol}-spread-chart`}
              className="h-[320px] w-full rounded-3xl border border-white/10 bg-slate-950/60"
            />
          ) : (
            <div className="flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/40 text-sm text-slate-500">
              TradingView 스프레드 식이 없는 조합입니다.
            </div>
          )}
        </div>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Gap Chart</div>
              <div className="mt-1 text-[11px] text-slate-400">Target 도달 여부와 현재 갭</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-pink-300/30 bg-pink-400/10 px-3 py-1 text-[11px] text-pink-100">Target {formatPct(targetGap)}</span>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${latestGap >= targetGap ? 'bg-emerald-400 text-slate-950' : 'bg-amber-300 text-slate-950'}`}>{formatPct(latestGap)}</span>
            </div>
          </div>
          {renderGapChart(gapValues)}
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] text-slate-500">현재 실행 Gap</div>
              <div className="mt-1 font-mono text-sm text-emerald-300">{formatPct(latestGap)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] text-slate-500">현재 예상 순수익</div>
              <div className="mt-1 font-mono text-sm text-cyan-300">{formatPct(latestNet)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] text-slate-500">상태</div>
              <div className={`mt-1 text-sm font-semibold ${latestGap >= targetGap ? 'text-emerald-300' : 'text-slate-300'}`}>{latestGap >= targetGap ? 'Target 도달' : 'Target 미도달'}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
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
  void networkState;
  void quantity;
  void onQuantityChange;
  void onApproveQuantity;
  void onApproveAuth;
  void onExecute;
  void onReset;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">Withdrawal Flow</p>
          <h2 className="mt-2 text-lg font-semibold text-white">출금 승인 흐름</h2>
          <p className="mt-1 text-sm text-slate-400">현재는 보조 운영 섹션으로 유지합니다. 필요할 때만 펼쳐 사용하세요.</p>
        </div>
        <CollapseButton collapsed={collapsed} onClick={onToggleCollapsed} />
      </div>
      {!collapsed ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold text-white">현재 후보</div>
            <div className="mt-2 text-sm text-slate-300">{candidate ? `${candidate.symbol} · ${candidate.routeLabel}` : '없음'}</div>
            <div className="mt-1 text-xs text-slate-500">업데이트 {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '대기 중'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold text-white">현재 단계</div>
            <div className="mt-2 text-sm text-slate-300">{formatStepLabel(step)} · {mode === 'auto' ? '자동 감지' : '수동 선택'}</div>
            <div className="mt-1 text-xs text-slate-500">로그 {logEntries.length}개</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

