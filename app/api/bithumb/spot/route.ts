import { NextResponse } from "next/server";
import type { BithumbAllTickerResponse } from "@/lib/types";
import { normalizeBithumbKrwTickers } from "@/lib/normalize";

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
    const res = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW", {
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Bithumb spot prices" },
        { status: res.status, headers: CORS_HEADERS }
      );
    }

    const data = (await res.json()) as BithumbAllTickerResponse;
    const tickers = normalizeBithumbKrwTickers(data);

    return NextResponse.json(
      {
        exchange: "bithumb-spot",
        updatedAt: new Date().toISOString(),
        tickers
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching Bithumb spot prices" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
