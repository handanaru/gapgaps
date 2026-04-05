import type {
  BinanceTicker,
  BithumbAllTickerResponse,
  NormalizedMarketTicker,
  OkxTickersResponse
} from "@/lib/types";

const USDT_SUFFIX = "USDT";
const KRW_SUFFIX = "KRW";

export function normalizeBinanceTickers(
  tickers: BinanceTicker[],
  exchange: "binance-spot" | "binance-perp"
): NormalizedMarketTicker[] {
  const timestamp = Date.now();

  return tickers
    .filter((ticker) => ticker.symbol.endsWith(USDT_SUFFIX))
    .map((ticker) => {
      const base = ticker.symbol.replace(USDT_SUFFIX, "");
      const price = Number(ticker.price);
      return {
        exchange,
        symbol: ticker.symbol,
        base,
        quote: "USDT",
        price,
        timestamp
      };
    })
    .filter((ticker) => Number.isFinite(ticker.price) && ticker.price > 0);
}

export function normalizeBithumbKrwTickers(payload: BithumbAllTickerResponse): NormalizedMarketTicker[] {
  if (payload.status !== "0000") return [];

  const timestamp = Date.now();

  return Object.entries(payload.data)
    .filter(([symbol]) => symbol !== "date")
    .map(([base, value]) => {
      const closingPrice = typeof value === "string" ? NaN : Number(value.closing_price);
      return {
        exchange: "bithumb-spot" as const,
        symbol: `${base}_${KRW_SUFFIX}`,
        base,
        quote: "KRW",
        price: closingPrice,
        timestamp
      };
    })
    .filter((ticker) => Number.isFinite(ticker.price) && ticker.price > 0);
}

export function normalizeOkxSpotTickers(payload: OkxTickersResponse): NormalizedMarketTicker[] {
  if (payload.code !== "0") return [];

  return payload.data
    .filter((ticker) => ticker.instId.endsWith(`-${USDT_SUFFIX}`))
    .map((ticker) => {
      const [base, quote] = ticker.instId.split("-");
      return {
        exchange: "okx-spot" as const,
        symbol: ticker.instId,
        base,
        quote,
        price: Number(ticker.last),
        timestamp: Number(ticker.ts)
      };
    })
    .filter((ticker) => Number.isFinite(ticker.price) && ticker.price > 0);
}
