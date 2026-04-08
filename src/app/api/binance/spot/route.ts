import { NextResponse } from "next/server";
import { normalizeBinanceSpotTicker } from "@/lib/exchanges";

const BINANCE_SPOT_URL = "https://api.binance.com/api/v3/ticker/24hr";
const BINANCE_SPOT_INFO_URL = "https://api.binance.com/api/v3/exchangeInfo";
const BINANCE_SYMBOL_PATTERN = /^[A-Z0-9]+$/;

type BinanceSpotInfoResponse = {
  symbols: Array<{
    symbol: string;
    baseAsset: string;
    status: string;
    quoteAsset: string;
    isSpotTradingAllowed?: boolean;
    permissionSets?: string[][];
  }>;
};

export async function GET() {
  try {
    const [tickerRes, infoRes] = await Promise.all([
      fetch(BINANCE_SPOT_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      }),
      fetch(BINANCE_SPOT_INFO_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      }),
    ]);

    if (!tickerRes.ok) {
      return NextResponse.json({ success: false, error: `Binance spot fetch failed: ${tickerRes.status}` }, { status: 502 });
    }

    if (!infoRes.ok) {
      return NextResponse.json({ success: false, error: `Binance spot exchangeInfo failed: ${infoRes.status}` }, { status: 502 });
    }

    const raw = (await tickerRes.json()) as { symbol: string; lastPrice: string; bidPrice?: string; askPrice?: string; quoteVolume: string }[];
    const info = (await infoRes.json()) as BinanceSpotInfoResponse;

    const activeSymbols = new Set(
      info.symbols
        .filter((symbol) => symbol.status === "TRADING")
        .filter((symbol) => symbol.quoteAsset === "USDT")
        .filter((symbol) => symbol.isSpotTradingAllowed !== false)
        .filter((symbol) => !symbol.permissionSets || symbol.permissionSets.some((set) => set.includes("SPOT")))
        .filter((symbol) => BINANCE_SYMBOL_PATTERN.test(symbol.symbol) && BINANCE_SYMBOL_PATTERN.test(symbol.baseAsset))
        .map((symbol) => symbol.symbol)
    );

    const data = raw
      .filter((item) => activeSymbols.has(item.symbol))
      .map(normalizeBinanceSpotTicker)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.quote === "USDT");

    return NextResponse.json({
      success: true,
      data,
      source: BINANCE_SPOT_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
