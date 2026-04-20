import { NextResponse } from "next/server";
import { normalizeAsterPerpTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const ASTER_BASE_URL = "https://www.asterdex.com";
const ASTER_SYMBOL_CONFIG_URL = `${ASTER_BASE_URL}/bapi/futures/v1/public/future/web3/alp/symbol-config`;
const ASTER_MARK_PRICE_URL = `${ASTER_BASE_URL}/fapi/v1/markPriceTicker`;

export async function GET() {
  try {
    const [symbolConfigResponse, markPriceResponse] = await Promise.all([
      fetch(ASTER_SYMBOL_CONFIG_URL, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 0 },
      }),
      fetch(ASTER_MARK_PRICE_URL, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 0 },
      }),
    ]);

    if (!symbolConfigResponse.ok) {
      throw new Error(`Aster symbol config fetch failed: ${symbolConfigResponse.status}`);
    }
    if (!markPriceResponse.ok) {
      throw new Error(`Aster mark price fetch failed: ${markPriceResponse.status}`);
    }

    const symbolConfigJson = (await symbolConfigResponse.json()) as {
      code?: string;
      data?: Array<{
        symbol: string;
        symbolName: string;
        quoteAsset: string;
        baseAsset: string;
        priceDecimal?: string;
        baseDecimal?: string;
        address?: string;
      }>;
    };
    const markPriceJson = (await markPriceResponse.json()) as Array<{
      symbol: string;
      lastPrice: string;
      openPrice?: string;
      highPrice?: string;
      lowPrice?: string;
      volume?: string;
      baseVolume?: string;
      quoteVolume?: string;
    }>;

    if (symbolConfigJson.code !== "000000" || !symbolConfigJson.data) {
      throw new Error(`Aster symbol config returned invalid payload: ${symbolConfigJson.code ?? "unknown"}`);
    }

    const data = normalizeAsterPerpTickers({
      symbolConfig: symbolConfigJson.data,
      markPriceTickers: markPriceJson,
    });

    return NextResponse.json({
      success: true,
      data,
      source: ASTER_SYMBOL_CONFIG_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return createBlockedExchangeResponse("Aster", "perp", error instanceof Error ? error.message : "Unknown error");
  }
}
