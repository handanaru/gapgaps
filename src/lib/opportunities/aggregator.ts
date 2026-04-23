import { ArbitrageOpportunity, NormalizedTicker, TransferStatus } from "@/lib/types";

export type OpportunityFilterKind = "all" | "basis" | "perp-perp" | "funding" | "cex-cex" | "cex-dex";
export type TransferStatusMap = Record<string, TransferStatus>;

export type AggregatedOpportunityRow = {
  id: string;
  kind: Exclude<OpportunityFilterKind, "all" | "funding">;
  sourceTitle: string;
  routeLabel: string;
  marketType: Exclude<OpportunityFilterKind, "all">;
  exchangeFrom: string;
  exchangeTo: string;
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  gapPct: number;
  netPct: number;
  status: "ready" | "reference";
  chainCompat: "verified" | "unknown";
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

export type OpportunityStreamSection = {
  kind: Exclude<OpportunityFilterKind, "all" | "funding">;
  sourceTitle: string;
  routeLabel: string;
  opportunities: ArbitrageOpportunity[];
  transferStatusConfig?: AggregatedOpportunityRow["transferStatusConfig"];
};

export type AggregatedFundingRow = {
  id: string;
  kind: "funding";
  marketType: "funding";
  symbol: string;
  exchangeFrom: string;
  exchangeTo: string;
  fundingRateFrom: number;
  fundingRateTo: number;
  fundingSpread: number;
  spread: number;
  payerExchange: string;
  receiverExchange: string;
  directionalHint: string;
  venues: number;
  highest: NormalizedTicker;
  lowest: NormalizedTicker;
};

export function buildOpportunityStream(sections: OpportunityStreamSection[]) {
  const rows: AggregatedOpportunityRow[] = [];

  for (const section of sections) {
    for (const opportunity of section.opportunities) {
      rows.push({
        id: `${section.kind}:${section.sourceTitle}:${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
        kind: section.kind,
        sourceTitle: section.sourceTitle,
        routeLabel: section.routeLabel,
        marketType: section.kind,
        exchangeFrom: opportunity.buyExchange,
        exchangeTo: opportunity.sellExchange,
        symbol: opportunity.symbol,
        buyPrice: opportunity.buyPrice,
        sellPrice: opportunity.sellPrice,
        gapPct: opportunity.gapPct,
        netPct: opportunity.estimatedNetPct,
        status: section.transferStatusConfig ? "ready" : "reference",
        chainCompat: section.transferStatusConfig ? "verified" : "unknown",
        opportunity,
        transferStatusConfig: section.transferStatusConfig,
      });
    }
  }

  return rows.sort((left, right) => right.netPct - left.netPct);
}

export function buildFundingStream(tickers: NormalizedTicker[]) {
  const grouped = new Map<string, NormalizedTicker[]>();

  for (const ticker of tickers) {
    if (!Number.isFinite(ticker.metadata?.fundingRate)) continue;
    const key = `${ticker.base}${ticker.quote}`;
    const current = grouped.get(key) ?? [];
    current.push(ticker);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([symbol, items]) => {
      if (items.length < 2) return null;
      const sorted = [...items].sort((a, b) => (a.metadata?.fundingRate ?? 0) - (b.metadata?.fundingRate ?? 0));
      const lowest = sorted[0];
      const highest = sorted[sorted.length - 1];
      const fundingRateFrom = highest.metadata?.fundingRate ?? 0;
      const fundingRateTo = lowest.metadata?.fundingRate ?? 0;
      const fundingSpread = fundingRateFrom - fundingRateTo;

      return {
        id: `funding:${symbol}:${highest.exchange}:${lowest.exchange}`,
        kind: "funding" as const,
        marketType: "funding" as const,
        symbol,
        exchangeFrom: highest.exchange,
        exchangeTo: lowest.exchange,
        fundingRateFrom,
        fundingRateTo,
        fundingSpread,
        spread: fundingSpread,
        payerExchange: highest.exchange,
        receiverExchange: lowest.exchange,
        directionalHint: `${highest.exchange} short / ${lowest.exchange} long`,
        venues: items.length,
        highest,
        lowest,
      } satisfies AggregatedFundingRow;
    })
    .filter((item): item is AggregatedFundingRow => Boolean(item))
    .sort((a, b) => Math.abs(b.fundingSpread) - Math.abs(a.fundingSpread));
}
