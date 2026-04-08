import { NextResponse } from "next/server";
import { normalizeGateIoPerpTickers } from "@/lib/exchanges";

const GATEIO_PERP_URL = "https://api.gateio.ws/api/v4/futures/usdt/tickers";

export async function GET() {
  try {
    const response = await fetch(GATEIO_PERP_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Gate.io perp fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as Array<{
      contract: string;
      last: string;
      highest_bid?: string;
      lowest_ask?: string;
      volume_24h_quote?: string;
    }>;
    const data = normalizeGateIoPerpTickers(raw);

    return NextResponse.json({
      success: true,
      data,
      source: GATEIO_PERP_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
