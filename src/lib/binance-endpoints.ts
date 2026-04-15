export const BINANCE_SPOT_TICKER_URLS = [
  "https://api.binance.com/api/v3/ticker/24hr",
  "https://data-api.binance.vision/api/v3/ticker/24hr",
  "https://api1.binance.com/api/v3/ticker/24hr",
  "https://api2.binance.com/api/v3/ticker/24hr",
  "https://api3.binance.com/api/v3/ticker/24hr",
] as const;

export const BINANCE_SPOT_INFO_URLS = [
  "https://api.binance.com/api/v3/exchangeInfo",
  "https://data-api.binance.vision/api/v3/exchangeInfo",
  "https://api1.binance.com/api/v3/exchangeInfo",
  "https://api2.binance.com/api/v3/exchangeInfo",
  "https://api3.binance.com/api/v3/exchangeInfo",
] as const;

export const BINANCE_FUTURES_PRICE_URLS = [
  "https://fapi.binance.com/fapi/v1/ticker/price",
  "https://fstream.binance.com/fapi/v1/ticker/price",
] as const;

export const BINANCE_FUTURES_BOOK_URLS = [
  "https://fapi.binance.com/fapi/v1/ticker/bookTicker",
  "https://fstream.binance.com/fapi/v1/ticker/bookTicker",
] as const;

export const BINANCE_FUTURES_INFO_URLS = [
  "https://fapi.binance.com/fapi/v1/exchangeInfo",
  "https://fstream.binance.com/fapi/v1/exchangeInfo",
] as const;

export async function fetchFirstJson<T>(urls: readonly string[]) {
  let lastError: string | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        lastError = `${url} -> ${response.status}`;
        continue;
      }

      const json = (await response.json()) as T;
      return { json, source: url };
    } catch (error) {
      lastError = error instanceof Error ? `${url} -> ${error.message}` : `${url} -> Unknown error`;
    }
  }

  throw new Error(lastError ?? "No Binance endpoint succeeded");
}
