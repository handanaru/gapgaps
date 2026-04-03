import { ArbitrageOpportunity, NormalizedTicker } from "@/lib/types";

const STABLE_QUOTES = ["USDT", "FDUSD", "USDC", "BUSD", "TUSD", "BTC", "ETH", "BNB", "TRY", "EUR"];

function splitSymbol(symbol: string) {
  const quote = STABLE_QUOTES.find((candidate) => symbol.endsWith(candidate));
  if (!quote) {
    return { base: symbol, quote: "" };
  }

  return {
    base: symbol.slice(0, -quote.length),
    quote,
  };
}

export function normalizeBinanceSpotTicker(raw: { symbol: string; price: string }): NormalizedTicker | null {
  const price = Number(raw.price);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;

  return {
    exchange: "Binance",
    marketType: "spot",
    symbol: raw.symbol,
    base,
    quote,
    price,
    timestamp: Date.now(),
  };
}

export function normalizeBinanceFuturesTicker(raw: { symbol: string; price: string }): NormalizedTicker | null {
  const price = Number(raw.price);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;

  return {
    exchange: "Binance",
    marketType: "perp",
    symbol: raw.symbol,
    base,
    quote,
    price,
    timestamp: Date.now(),
  };
}

export function calculateArbitrage(spotTickers: NormalizedTicker[], futuresTickers: NormalizedTicker[], feePct = 0.05) {
  const futuresMap = new Map(futuresTickers.map((ticker) => [ticker.symbol, ticker]));

  const opportunities: ArbitrageOpportunity[] = [];

  for (const spot of spotTickers) {
    const perp = futuresMap.get(spot.symbol);
    if (!perp) continue;

    const gapPct = ((perp.price - spot.price) / spot.price) * 100;
    const estimatedNetPct = Math.abs(gapPct) - feePct;

    opportunities.push({
      symbol: spot.symbol,
      spotPrice: spot.price,
      futuresPrice: perp.price,
      gapPct,
      estimatedNetPct,
      longLeg: gapPct >= 0 ? "Binance Spot" : "Binance Futures",
      shortLeg: gapPct >= 0 ? "Binance Futures" : "Binance Spot",
    });
  }

  return opportunities.sort((a, b) => b.estimatedNetPct - a.estimatedNetPct);
}
