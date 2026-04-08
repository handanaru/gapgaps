import { NextResponse } from "next/server";
import { normalizeOkxPerpTickers } from "@/lib/exchanges";

const OKX_SWAP_URL = "https://www.okx.com/api/v5/market/tickers?instType=SWAP";

export async function GET() {
  try {
    const response = await fetch(OKX_SWAP_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `OKX swap fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as {
      code: string;
      data: Array<{ instId: string; last: string; bidPx?: string; askPx?: string; volCcy24h?: string }>;
    };
    const data = normalizeOkxPerpTickers(raw).filter((item) => item.quote === "USDT");

    return NextResponse.json({
      success: true,
      data,
      source: OKX_SWAP_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
