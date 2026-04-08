import { NextResponse } from "next/server";
import { TransferStatus } from "@/lib/types";

const BYBIT_SPOT_URL = "https://api.bybit.com/v5/market/tickers?category=spot";

type BybitSpotResponse = {
  retCode: number;
  result?: {
    list?: Array<{
      symbol: string;
    }>;
  };
};

function splitUsdtSymbol(symbol: string) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -"USDT".length) : null;
}

export async function GET() {
  try {
    const response = await fetch(BYBIT_SPOT_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Bybit spot fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as BybitSpotResponse;
    const symbols = raw.result?.list ?? [];
    const data = symbols.reduce<Record<string, TransferStatus>>((acc, item) => {
      const base = splitUsdtSymbol(item.symbol);
      if (!base) return acc;

      acc[base] = {
        depositEnabled: null,
        withdrawEnabled: null,
        networks: [],
      };
      return acc;
    }, {});

    data.USDT ??= {
      depositEnabled: null,
      withdrawEnabled: null,
      networks: [],
    };

    return NextResponse.json({
      success: true,
      data,
      source: BYBIT_SPOT_URL,
      count: Object.keys(data).length,
      fetchedAt: Date.now(),
      note: "Bybit public market data is available, but transfer availability is not exposed through the public endpoint used here.",
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
