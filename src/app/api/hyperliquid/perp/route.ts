import { NextResponse } from "next/server";
import { normalizeHyperliquidPerpTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export async function GET() {
  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid perp fetch failed: ${response.status}`);
    }

    const raw = (await response.json()) as [Array<{ name: string }>, Array<{ midPx?: string; oraclePx?: string; markPx?: string; dayNtlVlm?: string }>];
    const data = normalizeHyperliquidPerpTickers({
      universe: raw[0] ?? [],
      assetCtxs: raw[1] ?? [],
    });

    return NextResponse.json({
      success: true,
      data,
      source: HYPERLIQUID_INFO_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return createBlockedExchangeResponse("Hyperliquid", "perp", error instanceof Error ? error.message : "Unknown error");
  }
}
