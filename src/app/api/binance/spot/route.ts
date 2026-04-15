import { NextResponse } from "next/server";
import { normalizeBinanceSpotTicker } from "@/lib/exchanges";
import { BINANCE_SPOT_INFO_URLS, BINANCE_SPOT_TICKER_URLS, fetchFirstJson } from "@/lib/binance-endpoints";

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
    const [{ json: raw, source: tickerSource }, { json: info, source: infoSource }] = await Promise.all([
      fetchFirstJson<{ symbol: string; lastPrice: string; bidPrice?: string; askPrice?: string; quoteVolume: string }[]>(BINANCE_SPOT_TICKER_URLS),
      fetchFirstJson<BinanceSpotInfoResponse>(BINANCE_SPOT_INFO_URLS),
    ]);

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
      source: { ticker: tickerSource, exchangeInfo: infoSource },
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
