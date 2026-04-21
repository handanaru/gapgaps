import { NextResponse } from "next/server";
import { normalizeGateIoPerpTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const GATEIO_PERP_URL = "https://api.gateio.ws/api/v4/futures/usdt/tickers";

export async function GET() {
  try {
    const response = await fetch(GATEIO_PERP_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Gate.io perp fetch failed: ${response.status}`);
    }

    const raw = (await response.json()) as Array<{
      contract: string;
      last: string;
      highest_bid?: string;
      lowest_ask?: string;
      volume_24h_quote?: string;
      funding_rate?: string;
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
    return createBlockedExchangeResponse("Gate.io", "perp", error instanceof Error ? error.message : "Unknown error");
  }
}
