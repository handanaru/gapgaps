import { NextResponse } from "next/server";
import { normalizeOkxSpotTickers } from "@/lib/exchanges";

const OKX_SPOT_URL = "https://www.okx.com/api/v5/market/tickers?instType=SPOT";

export async function GET() {
  try {
    const response = await fetch(OKX_SPOT_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `OKX spot fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as { code: string; data: Array<{ instId: string; last: string; bidPx?: string; askPx?: string; volCcy24h?: string }> };
    const data = normalizeOkxSpotTickers(raw).filter((item) => item.quote === "USDT");

    return NextResponse.json({
      success: true,
      data,
      source: OKX_SPOT_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
