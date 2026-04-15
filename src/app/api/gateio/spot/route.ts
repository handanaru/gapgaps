import { NextResponse } from "next/server";
import { normalizeGateIoSpotTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const GATEIO_SPOT_URL = "https://api.gateio.ws/api/v4/spot/tickers";

export async function GET() {
  try {
    const response = await fetch(GATEIO_SPOT_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Gate.io spot fetch failed: ${response.status}`);
    }

    const raw = (await response.json()) as Array<{
      currency_pair: string;
      last: string;
      highest_bid?: string;
      lowest_ask?: string;
      quote_volume?: string;
    }>;
    const data = normalizeGateIoSpotTickers(raw);

    return NextResponse.json({
      success: true,
      data,
      source: GATEIO_SPOT_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return createBlockedExchangeResponse("Gate.io", "spot", error instanceof Error ? error.message : "Unknown error");
  }
}
