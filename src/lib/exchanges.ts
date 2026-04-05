import { ArbitrageOpportunity, NormalizedTicker } from "@/lib/types";

const STABLE_QUOTES = ["USDT", "FDUSD", "USDC", "BUSD", "TUSD", "BTC", "ETH", "BNB", "TRY", "EUR", "USD", "KRW"];

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

export function normalizeBinanceSpotTicker(raw: { symbol: string; lastPrice: string; quoteVolume: string }): NormalizedTicker | null {
  const price = Number(raw.lastPrice);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) return null;
  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;
  const volume24h = Number(raw.quoteVolume);
  return {
    exchange: "Binance",
    marketType: "spot",
    symbol: raw.symbol,
    base,
    quote,
    price,
    volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
    timestamp: Date.now(),
  };
}

export function normalizeBinanceFuturesTicker(raw: { symbol: string; price: string }): NormalizedTicker | null {
  const price = Number(raw.price);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) return null;
  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;
  return { exchange: "Binance", marketType: "perp", symbol: raw.symbol, base, quote, price, timestamp: Date.now() };
}


export function normalizeBithumbSpotTickers(
  raw: { status: string; data: Record<string, { closing_price: string; acc_trade_value_24H?: string }> }
): NormalizedTicker[] {
  if (raw.status !== "0000") return [];

  const result: NormalizedTicker[] = [];

  for (const [base, value] of Object.entries(raw.data)) {
    if (base === "date") continue;
    const price = Number(value.closing_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(value.acc_trade_value_24H);

    result.push({
      exchange: "Bithumb",
      marketType: "spot",
      symbol: `${base}KRW`,
      base,
      quote: "KRW",
      price,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeOkxSpotTickers(raw: { code: string; data: Array<{ instId: string; last: string; volCcy24h?: string }> }): NormalizedTicker[] {
  if (raw.code !== "0") return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.data) {
    const [base, quote] = item.instId.split("-");
    const price = Number(item.last);
    if (!base || !quote || !Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(item.volCcy24h);

    result.push({
      exchange: "OKX",
      marketType: "spot",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeOkxPerpTickers(raw: { code: string; data: Array<{ instId: string; last: string; volCcy24h?: string }> }): NormalizedTicker[] {
  if (raw.code !== "0") return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.data) {
    const [base, quote] = item.instId.split("-");
    const price = Number(item.last);
    if (!base || !quote || !Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(item.volCcy24h);

    result.push({
      exchange: "OKX",
      marketType: "perp",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
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
      buyExchange: gapPct >= 0 ? "Binance Spot" : "Binance Futures",
      sellExchange: gapPct >= 0 ? "Binance Futures" : "Binance Spot",
      buyPrice: gapPct >= 0 ? spot.price : perp.price,
      sellPrice: gapPct >= 0 ? perp.price : spot.price,
      gapPct,
      estimatedNetPct,
      longLeg: gapPct >= 0 ? "Binance Spot" : "Binance Futures",
      shortLeg: gapPct >= 0 ? "Binance Futures" : "Binance Spot",
    });
  }

  return opportunities.sort((a, b) => b.estimatedNetPct - a.estimatedNetPct);
}

export function calculateCrossExchangeArbitrage(
  leftTickers: NormalizedTicker[],
  rightTickers: NormalizedTicker[],
  options: { leftFeePct: number; rightFeePct: number; rightQuoteToKrw?: number; leftLabel: string; rightLabel: string }
) {
  const rightMap = new Map(rightTickers.map((ticker) => [ticker.base, ticker]));
  const opportunities: ArbitrageOpportunity[] = [];

  for (const left of leftTickers) {
    const right = rightMap.get(left.base);
    if (!right) continue;

    const leftPriceKrw = left.quote === "KRW" ? left.price : left.price * (options.rightQuoteToKrw ?? 1);
    const rightPriceKrw = right.quote === "KRW" ? right.price : right.price * (options.rightQuoteToKrw ?? 1);
    if (!Number.isFinite(leftPriceKrw) || !Number.isFinite(rightPriceKrw) || leftPriceKrw <= 0 || rightPriceKrw <= 0) continue;

    const cheaper = leftPriceKrw <= rightPriceKrw ? { label: options.leftLabel, price: leftPriceKrw } : { label: options.rightLabel, price: rightPriceKrw };
    const expensive = leftPriceKrw > rightPriceKrw ? { label: options.leftLabel, price: leftPriceKrw } : { label: options.rightLabel, price: rightPriceKrw };
    const gapPct = ((expensive.price - cheaper.price) / cheaper.price) * 100;
    const estimatedNetPct = gapPct - (options.leftFeePct + options.rightFeePct);

    opportunities.push({
      symbol: `${left.base}/KRW`,
      buyExchange: cheaper.label,
      sellExchange: expensive.label,
      buyPrice: cheaper.price,
      sellPrice: expensive.price,
      gapPct,
      estimatedNetPct,
      longLeg: cheaper.label,
      shortLeg: expensive.label,
    });
  }

  return opportunities.sort((a, b) => b.estimatedNetPct - a.estimatedNetPct);
}
