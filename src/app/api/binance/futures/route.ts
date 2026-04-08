import { NextResponse } from "next/server";
import { normalizeBinanceFuturesTicker } from "@/lib/exchanges";

const BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/ticker/price";
const BINANCE_FUTURES_BOOK_URL = "https://fapi.binance.com/fapi/v1/ticker/bookTicker";
const BINANCE_FUTURES_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";

export async function GET() {
  try {
    const [priceRes, bookRes, infoRes] = await Promise.all([
      fetch(BINANCE_FUTURES_URL, { headers: { Accept: "application/json" }, next: { revalidate: 0 } }),
      fetch(BINANCE_FUTURES_BOOK_URL, { headers: { Accept: "application/json" }, next: { revalidate: 0 } }),
      fetch(BINANCE_FUTURES_INFO_URL, { headers: { Accept: "application/json" }, next: { revalidate: 0 } }),
    ]);

    if (!priceRes.ok) {
      return NextResponse.json({ success: false, error: `Binance futures fetch failed: ${priceRes.status}` }, { status: 502 });
    }
    if (!bookRes.ok) {
      return NextResponse.json({ success: false, error: `Binance futures bookTicker failed: ${bookRes.status}` }, { status: 502 });
    }
    if (!infoRes.ok) {
      return NextResponse.json({ success: false, error: `Binance futures exchangeInfo failed: ${infoRes.status}` }, { status: 502 });
    }

    const raw = (await priceRes.json()) as { symbol: string; price: string }[];
    const book = (await bookRes.json()) as { symbol: string; bidPrice?: string; askPrice?: string }[];
    const info = (await infoRes.json()) as { symbols: { symbol: string; status: string; contractType: string }[] };
    const bookMap = new Map(book.map((item) => [item.symbol, item]));

    // Only keep PERPETUAL contracts currently in TRADING status
    const activeSymbols = new Set(
      info.symbols
        .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL")
        .map((s) => s.symbol)
    );

    const data = raw
      .filter((item) => activeSymbols.has(item.symbol))
      .map((item) =>
        normalizeBinanceFuturesTicker({
          ...item,
          bidPrice: bookMap.get(item.symbol)?.bidPrice,
          askPrice: bookMap.get(item.symbol)?.askPrice,
        })
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.quote === "USDT");

    return NextResponse.json({
      success: true,
      data,
      source: BINANCE_FUTURES_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
