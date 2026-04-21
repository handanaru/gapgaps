import { NextResponse } from "next/server";
import { normalizeBinanceFuturesTicker } from "@/lib/exchanges";
import {
  BINANCE_FUTURES_BOOK_URLS,
  BINANCE_FUTURES_INFO_URLS,
  BINANCE_FUTURES_PRICE_URLS,
  fetchFirstJson,
} from "@/lib/binance-endpoints";

export async function GET() {
  try {
    const [{ json: raw, source: priceSource }, { json: book, source: bookSource }, { json: info, source: infoSource }, { json: premium, source: premiumSource }] = await Promise.all([
      fetchFirstJson<{ symbol: string; price: string }[]>(BINANCE_FUTURES_PRICE_URLS),
      fetchFirstJson<{ symbol: string; bidPrice?: string; askPrice?: string }[]>(BINANCE_FUTURES_BOOK_URLS),
      fetchFirstJson<{ symbols: { symbol: string; status: string; contractType: string }[] }>(BINANCE_FUTURES_INFO_URLS),
      fetchFirstJson<{ symbol: string; lastFundingRate?: string }[]>(["https://fapi.binance.com/fapi/v1/premiumIndex"]),
    ]);
    const bookMap = new Map(book.map((item) => [item.symbol, item]));
    const premiumMap = new Map(premium.map((item) => [item.symbol, item]));

    const activeSymbols = new Set(
      info.symbols
        .filter((symbol) => symbol.status === "TRADING" && symbol.contractType === "PERPETUAL")
        .map((symbol) => symbol.symbol)
    );

    const data = raw
      .filter((item) => activeSymbols.has(item.symbol))
      .map((item) =>
        normalizeBinanceFuturesTicker({
          ...item,
          bidPrice: bookMap.get(item.symbol)?.bidPrice,
          askPrice: bookMap.get(item.symbol)?.askPrice,
          fundingRate: premiumMap.get(item.symbol)?.lastFundingRate,
        })
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.quote === "USDT");

    return NextResponse.json({
      success: true,
      data,
      source: { price: priceSource, bookTicker: bookSource, exchangeInfo: infoSource, premiumIndex: premiumSource },
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isBlocked = message.includes("403") || message.includes("451");

    return NextResponse.json(
      {
        success: false,
        disabled: isBlocked,
        data: [],
        error: message,
        fetchedAt: Date.now(),
      },
      { status: isBlocked ? 200 : 500 }
    );
  }
}
