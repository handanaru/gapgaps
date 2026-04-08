import { NextResponse } from "next/server";
import { normalizeBithumbSpotTickers } from "@/lib/exchanges";

const BITHUMB_SPOT_URL = "https://api.bithumb.com/public/ticker/ALL_KRW";
const BITHUMB_ORDERBOOK_URL = "https://api.bithumb.com/public/orderbook/ALL_KRW";

export async function GET() {
  try {
    const [tickerResponse, orderbookResponse] = await Promise.all([
      fetch(BITHUMB_SPOT_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      }),
      fetch(BITHUMB_ORDERBOOK_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      }),
    ]);

    if (!tickerResponse.ok) {
      return NextResponse.json({ success: false, error: `Bithumb spot fetch failed: ${tickerResponse.status}` }, { status: 502 });
    }

    if (!orderbookResponse.ok) {
      return NextResponse.json({ success: false, error: `Bithumb orderbook fetch failed: ${orderbookResponse.status}` }, { status: 502 });
    }

    const raw = (await tickerResponse.json()) as { status: string; data: Record<string, { closing_price: string }> };
    const orderbook = (await orderbookResponse.json()) as {
      status: string;
      data: Record<string, { bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>;
    };
    const data = normalizeBithumbSpotTickers(raw, orderbook.data);

    return NextResponse.json({
      success: true,
      data,
      source: [BITHUMB_SPOT_URL, BITHUMB_ORDERBOOK_URL],
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
