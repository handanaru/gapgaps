import { NextResponse } from "next/server";
import type { OkxTickersResponse } from "@/lib/types";
import { normalizeOkxSpotTickers } from "@/lib/normalize";

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
    const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch OKX spot prices" },
        { status: res.status, headers: CORS_HEADERS }
      );
    }

    const data = (await res.json()) as OkxTickersResponse;
    const tickers = normalizeOkxSpotTickers(data);

    return NextResponse.json(
      {
        exchange: "okx-spot",
        updatedAt: new Date().toISOString(),
        tickers
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching OKX spot prices" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
