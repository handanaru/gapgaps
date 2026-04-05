import { NextResponse } from "next/server";
import { normalizeBinanceFuturesTicker } from "@/lib/exchanges";

const BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/ticker/price";

export async function GET() {
  try {
    const response = await fetch(BINANCE_FUTURES_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Binance futures fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as { symbol: string; price: string }[];
    const data = raw
      .map(normalizeBinanceFuturesTicker)
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
