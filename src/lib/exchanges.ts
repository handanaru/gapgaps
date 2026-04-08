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

export function normalizeBinanceSpotTicker(raw: { symbol: string; lastPrice: string; bidPrice?: string; askPrice?: string; quoteVolume: string }): NormalizedTicker | null {
  const price = Number(raw.lastPrice);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) return null;
  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;
  const volume24h = Number(raw.quoteVolume);
  const bidPrice = Number(raw.bidPrice);
  const askPrice = Number(raw.askPrice);
  return {
    exchange: "Binance",
    marketType: "spot",
    symbol: raw.symbol,
    base,
    quote,
    price,
    bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
    askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
    volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
    timestamp: Date.now(),
  };
}

export function normalizeBinanceFuturesTicker(raw: { symbol: string; price: string; bidPrice?: string; askPrice?: string }): NormalizedTicker | null {
  const price = Number(raw.price);
  if (!raw.symbol || !Number.isFinite(price) || price <= 0) return null;
  const { base, quote } = splitSymbol(raw.symbol);
  if (!quote) return null;
  const bidPrice = Number(raw.bidPrice);
  const askPrice = Number(raw.askPrice);
  return {
    exchange: "Binance",
    marketType: "perp",
    symbol: raw.symbol,
    base,
    quote,
    price,
    bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
    askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
    timestamp: Date.now(),
  };
}


export function normalizeBithumbSpotTickers(
  raw: { status: string; data: Record<string, { closing_price: string; acc_trade_value_24H?: string }> },
  orderbook?: Record<string, { bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>
): NormalizedTicker[] {
  if (raw.status !== "0000") return [];

  const result: NormalizedTicker[] = [];

  for (const [base, value] of Object.entries(raw.data)) {
    if (base === "date") continue;
    const price = Number(value.closing_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(value.acc_trade_value_24H);
    const bestBid = Number(orderbook?.[base]?.bids?.[0]?.price);
    const bestAsk = Number(orderbook?.[base]?.asks?.[0]?.price);

    result.push({
      exchange: "Bithumb",
      marketType: "spot",
      symbol: `${base}KRW`,
      base,
      quote: "KRW",
      price,
      bidPrice: Number.isFinite(bestBid) && bestBid > 0 ? bestBid : undefined,
      askPrice: Number.isFinite(bestAsk) && bestAsk > 0 ? bestAsk : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeUpbitSpotTickers(
  raw: Array<{
    market: string;
    trade_price: number;
    acc_trade_price_24h?: number;
    timestamp?: number;
  }>,
  orderbook?: Record<
    string,
    {
      orderbook_units?: Array<{
        bid_price: number;
        ask_price: number;
      }>;
    }
  >
): NormalizedTicker[] {
  const result: NormalizedTicker[] = [];

  for (const item of raw) {
    const [quote, base] = item.market.split("-");
    const price = Number(item.trade_price);
    if (quote !== "KRW" || !base || !Number.isFinite(price) || price <= 0) continue;

    const volume24h = Number(item.acc_trade_price_24h);
    const bestBid = Number(orderbook?.[item.market]?.orderbook_units?.[0]?.bid_price);
    const bestAsk = Number(orderbook?.[item.market]?.orderbook_units?.[0]?.ask_price);

    result.push({
      exchange: "Upbit",
      marketType: "spot",
      symbol: `${base}KRW`,
      base,
      quote: "KRW",
      price,
      bidPrice: Number.isFinite(bestBid) && bestBid > 0 ? bestBid : undefined,
      askPrice: Number.isFinite(bestAsk) && bestAsk > 0 ? bestAsk : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: item.timestamp ?? Date.now(),
    });
  }

  return result;
}

export function normalizeOkxSpotTickers(raw: { code: string; data: Array<{ instId: string; last: string; bidPx?: string; askPx?: string; volCcy24h?: string }> }): NormalizedTicker[] {
  if (raw.code !== "0") return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.data) {
    const [base, quote] = item.instId.split("-");
    const price = Number(item.last);
    if (!base || !quote || !Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(item.volCcy24h);
    const bidPrice = Number(item.bidPx);
    const askPrice = Number(item.askPx);

    result.push({
      exchange: "OKX",
      marketType: "spot",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeOkxPerpTickers(raw: { code: string; data: Array<{ instId: string; last: string; bidPx?: string; askPx?: string; volCcy24h?: string }> }): NormalizedTicker[] {
  if (raw.code !== "0") return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.data) {
    const [base, quote] = item.instId.split("-");
    const price = Number(item.last);
    if (!base || !quote || !Number.isFinite(price) || price <= 0) continue;
    const volume24h = Number(item.volCcy24h);
    const bidPrice = Number(item.bidPx);
    const askPrice = Number(item.askPx);

    result.push({
      exchange: "OKX",
      marketType: "perp",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeBybitSpotTickers(
  raw: {
    retCode: number;
    result?: {
      list?: Array<{
        symbol: string;
        lastPrice: string;
        bid1Price?: string;
        ask1Price?: string;
        turnover24h?: string;
      }>;
    };
  }
): NormalizedTicker[] {
  if (raw.retCode !== 0) return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.result?.list ?? []) {
    const price = Number(item.lastPrice);
    if (!item.symbol || !Number.isFinite(price) || price <= 0) continue;
    const { base, quote } = splitSymbol(item.symbol);
    if (quote !== "USDT") continue;

    const volume24h = Number(item.turnover24h);
    const bidPrice = Number(item.bid1Price);
    const askPrice = Number(item.ask1Price);

    result.push({
      exchange: "Bybit",
      marketType: "spot",
      symbol: item.symbol,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeGateIoSpotTickers(
  raw: Array<{
    currency_pair: string;
    last: string;
    highest_bid?: string;
    lowest_ask?: string;
    quote_volume?: string;
  }>
): NormalizedTicker[] {
  const result: NormalizedTicker[] = [];

  for (const item of raw) {
    const [base, quote] = item.currency_pair.split("_");
    const price = Number(item.last);
    if (!base || quote !== "USDT" || !Number.isFinite(price) || price <= 0) continue;

    const volume24h = Number(item.quote_volume);
    const bidPrice = Number(item.highest_bid);
    const askPrice = Number(item.lowest_ask);

    result.push({
      exchange: "Gate.io",
      marketType: "spot",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeBybitPerpTickers(
  raw: {
    retCode: number;
    result?: {
      list?: Array<{
        symbol: string;
        lastPrice: string;
        bid1Price?: string;
        ask1Price?: string;
        turnover24h?: string;
      }>;
    };
  }
): NormalizedTicker[] {
  if (raw.retCode !== 0) return [];

  const result: NormalizedTicker[] = [];

  for (const item of raw.result?.list ?? []) {
    const price = Number(item.lastPrice);
    if (!item.symbol || !Number.isFinite(price) || price <= 0) continue;
    const { base, quote } = splitSymbol(item.symbol);
    if (quote !== "USDT") continue;

    const volume24h = Number(item.turnover24h);
    const bidPrice = Number(item.bid1Price);
    const askPrice = Number(item.ask1Price);

    result.push({
      exchange: "Bybit",
      marketType: "perp",
      symbol: item.symbol,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function normalizeGateIoPerpTickers(
  raw: Array<{
    contract: string;
    last: string;
    highest_bid?: string;
    lowest_ask?: string;
    volume_24h_quote?: string;
  }>
): NormalizedTicker[] {
  const result: NormalizedTicker[] = [];

  for (const item of raw) {
    const [base, quote] = item.contract.split("_");
    const price = Number(item.last);
    if (!base || quote !== "USDT" || !Number.isFinite(price) || price <= 0) continue;

    const volume24h = Number(item.volume_24h_quote);
    const bidPrice = Number(item.highest_bid);
    const askPrice = Number(item.lowest_ask);

    result.push({
      exchange: "Gate.io",
      marketType: "perp",
      symbol: `${base}${quote}`,
      base,
      quote,
      price,
      bidPrice: Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : undefined,
      askPrice: Number.isFinite(askPrice) && askPrice > 0 ? askPrice : undefined,
      volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : undefined,
      timestamp: Date.now(),
    });
  }

  return result;
}

function getExecutableBuyPrice(ticker: NormalizedTicker, quoteToKrw = 1) {
  return (ticker.askPrice ?? ticker.price) * (ticker.quote === "KRW" ? 1 : quoteToKrw);
}

function getExecutableSellPrice(ticker: NormalizedTicker, quoteToKrw = 1) {
  return (ticker.bidPrice ?? ticker.price) * (ticker.quote === "KRW" ? 1 : quoteToKrw);
}

export function calculateArbitrage(spotTickers: NormalizedTicker[], futuresTickers: NormalizedTicker[], feePct = 0.05) {
  const futuresMap = new Map(futuresTickers.map((ticker) => [ticker.symbol, ticker]));

  const opportunities: ArbitrageOpportunity[] = [];

  for (const spot of spotTickers) {
    const perp = futuresMap.get(spot.symbol);
    if (!perp) continue;

    const positiveExecutableGapPct = ((getExecutableSellPrice(perp) - getExecutableBuyPrice(spot)) / getExecutableBuyPrice(spot)) * 100;
    const negativeExecutableGapPct = ((getExecutableSellPrice(spot) - getExecutableBuyPrice(perp)) / getExecutableBuyPrice(perp)) * 100;
    const buyingSpot = positiveExecutableGapPct >= negativeExecutableGapPct;
    const gapPct = buyingSpot ? positiveExecutableGapPct : -negativeExecutableGapPct;
    const referenceGapPct = ((perp.price - spot.price) / spot.price) * 100;
    const estimatedNetPct = Math.abs(gapPct) - feePct;

    opportunities.push({
      symbol: spot.symbol,
      buyExchange: buyingSpot ? "Binance Spot" : "Binance Futures",
      sellExchange: buyingSpot ? "Binance Futures" : "Binance Spot",
      buyPrice: buyingSpot ? getExecutableBuyPrice(spot) : getExecutableBuyPrice(perp),
      sellPrice: buyingSpot ? getExecutableSellPrice(perp) : getExecutableSellPrice(spot),
      gapPct,
      referenceGapPct,
      estimatedNetPct,
      longLeg: buyingSpot ? "Binance Spot" : "Binance Futures",
      shortLeg: buyingSpot ? "Binance Futures" : "Binance Spot",
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

    const leftToRightGapPct =
      ((getExecutableSellPrice(right, options.rightQuoteToKrw ?? 1) - getExecutableBuyPrice(left, options.rightQuoteToKrw ?? 1)) /
        getExecutableBuyPrice(left, options.rightQuoteToKrw ?? 1)) *
      100;
    const rightToLeftGapPct =
      ((getExecutableSellPrice(left, options.rightQuoteToKrw ?? 1) - getExecutableBuyPrice(right, options.rightQuoteToKrw ?? 1)) /
        getExecutableBuyPrice(right, options.rightQuoteToKrw ?? 1)) *
      100;
    const buyingLeft = leftToRightGapPct >= rightToLeftGapPct;
    const gapPct = buyingLeft ? leftToRightGapPct : -rightToLeftGapPct;
    const referenceGapPct = ((rightPriceKrw - leftPriceKrw) / leftPriceKrw) * 100;
    const estimatedNetPct = Math.abs(gapPct) - (options.leftFeePct + options.rightFeePct);

    opportunities.push({
      symbol: `${left.base}/KRW`,
      buyExchange: buyingLeft ? options.leftLabel : options.rightLabel,
      sellExchange: buyingLeft ? options.rightLabel : options.leftLabel,
      buyPrice: buyingLeft ? getExecutableBuyPrice(left, options.rightQuoteToKrw ?? 1) : getExecutableBuyPrice(right, options.rightQuoteToKrw ?? 1),
      sellPrice: buyingLeft ? getExecutableSellPrice(right, options.rightQuoteToKrw ?? 1) : getExecutableSellPrice(left, options.rightQuoteToKrw ?? 1),
      gapPct,
      referenceGapPct,
      estimatedNetPct,
      longLeg: buyingLeft ? options.leftLabel : options.rightLabel,
      shortLeg: buyingLeft ? options.rightLabel : options.leftLabel,
    });
  }

  return opportunities.sort((a, b) => b.estimatedNetPct - a.estimatedNetPct);
}
