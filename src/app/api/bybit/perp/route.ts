import { NextResponse } from "next/server";
import { normalizeBybitPerpTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const BYBIT_PERP_URL = "https://api.bybit.com/v5/market/tickers?category=linear";

export async function GET() {
  try {
    const response = await fetch(BYBIT_PERP_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Bybit perp fetch failed: ${response.status}`);
    }

    const raw = (await response.json()) as {
      retCode: number;
      result?: {
        list?: Array<{
          symbol: string;
          lastPrice: string;
          bid1Price?: string;
          ask1Price?: string;
          turnover24h?: string;
          fundingRate?: string;
        }>;
      };
    };
    const data = normalizeBybitPerpTickers(raw);

    return NextResponse.json({
      success: true,
      data,
      source: BYBIT_PERP_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return createBlockedExchangeResponse("Bybit", "perp", error instanceof Error ? error.message : "Unknown error");
  }
}
