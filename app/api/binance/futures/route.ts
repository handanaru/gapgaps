import { NextResponse } from "next/server";
import type { BinanceTicker } from "@/lib/types";
import { normalizeBinanceTickers } from "@/lib/normalize";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", {
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Binance futures prices" },
        { status: res.status, headers: CORS_HEADERS }
      );
    }

    const data = (await res.json()) as BinanceTicker[];
    const tickers = normalizeBinanceTickers(data, "binance-perp");

    return NextResponse.json(
      {
        exchange: "binance-perp",
        updatedAt: new Date().toISOString(),
        tickers
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching Binance futures prices" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
