import { NextResponse } from "next/server";
import { normalizeBithumbSpotTickers } from "@/lib/exchanges";

const BITHUMB_SPOT_URL = "https://api.bithumb.com/public/ticker/ALL_KRW";

export async function GET() {
  try {
    const response = await fetch(BITHUMB_SPOT_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Bithumb spot fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as { status: string; data: Record<string, { closing_price: string }> };
    const data = normalizeBithumbSpotTickers(raw);

    return NextResponse.json({
      success: true,
      data,
      source: BITHUMB_SPOT_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
