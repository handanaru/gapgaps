import { NextResponse } from "next/server";

const BITHUMB_USDT_URL = "https://api.bithumb.com/public/ticker/USDT_KRW";

export async function GET() {
  try {
    const response = await fetch(BITHUMB_USDT_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `USDT/KRW fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as { status: string; data: { closing_price: string } };
    const rate = Number(raw?.data?.closing_price);

    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ success: false, error: "Invalid USDT/KRW rate" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { symbol: "USDTKRW", rate },
      source: BITHUMB_USDT_URL,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
