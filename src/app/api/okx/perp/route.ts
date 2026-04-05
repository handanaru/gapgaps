import { NextResponse } from "next/server";
import { normalizeOkxPerpTickers } from "@/lib/exchanges";

const OKX_PERP_URL = "https://www.okx.com/api/v5/market/tickers?instType=SWAP";

export async function GET() {
  try {
    const response = await fetch(OKX_PERP_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `OKX perp fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as { code: string; data: Array<{ instId: string; last: string }> };
    const data = normalizeOkxPerpTickers(raw);

    return NextResponse.json({
      success: true,
      data,
      source: OKX_PERP_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
