import { NextResponse } from "next/server";
import { normalizeEdgeXPerpTickers } from "@/lib/exchanges";
import { createBlockedExchangeResponse } from "@/lib/api-guard";

const EDGEX_BASE_URL = "https://pro.edgex.exchange/api";
const EDGEX_METADATA_URL = `${EDGEX_BASE_URL}/v1/public/meta/getMetaData`;
const EDGEX_DEPTH_URL = `${EDGEX_BASE_URL}/v1/public/quote/getDepth`;
const DEPTH_LEVEL = 15;

export async function GET() {
  try {
    const metadataResponse = await fetch(EDGEX_METADATA_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 0 },
    });

    if (!metadataResponse.ok) {
      throw new Error(`EdgeX metadata fetch failed: ${metadataResponse.status}`);
    }

    const metadataJson = (await metadataResponse.json()) as {
      code?: string;
      data?: {
        coinList?: Array<{ coinId: string; coinName: string }>;
        contractList?: Array<{
          contractId: string;
          contractName: string;
          baseCoinId: string;
          quoteCoinId: string;
          enableTrade?: boolean;
          enableDisplay?: boolean;
        }>;
      };
    };

    if (metadataJson.code !== "SUCCESS" || !metadataJson.data) {
      throw new Error(`EdgeX metadata returned invalid payload: ${metadataJson.code ?? "unknown"}`);
    }

    const tradableContracts = (metadataJson.data.contractList ?? [])
      .filter((contract) => contract.enableTrade === true && contract.enableDisplay !== false)
      .map((contract) => contract.contractId)
      .filter(Boolean);

    const depthByContractId: Record<string, { contractId?: string; bids?: Array<{ price?: string }>; asks?: Array<{ price?: string }> }> = {};

    for (let index = 0; index < tradableContracts.length; index += 40) {
      const batch = tradableContracts.slice(index, index + 40);
      if (batch.length === 0) continue;

      const params = new URLSearchParams();
      params.append("level", String(DEPTH_LEVEL));
      for (const contractId of batch) {
        params.append("contractId", contractId);
      }

      const depthResponse = await fetch(`${EDGEX_DEPTH_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        next: { revalidate: 0 },
      });

      if (!depthResponse.ok) {
        throw new Error(`EdgeX depth fetch failed: ${depthResponse.status}`);
      }

      const depthJson = (await depthResponse.json()) as {
        code?: string;
        data?: Array<{ contractId?: string; bids?: Array<{ price?: string }>; asks?: Array<{ price?: string }> }>;
      };

      if (depthJson.code !== "SUCCESS") {
        throw new Error(`EdgeX depth returned invalid payload: ${depthJson.code ?? "unknown"}`);
      }

      for (const item of depthJson.data ?? []) {
        if (item?.contractId) {
          depthByContractId[item.contractId] = item;
        }
      }
    }

    const data = normalizeEdgeXPerpTickers({
      coinList: metadataJson.data.coinList,
      contractList: metadataJson.data.contractList,
      depthByContractId,
    });

    return NextResponse.json({
      success: true,
      data,
      source: EDGEX_METADATA_URL,
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return createBlockedExchangeResponse("EdgeX", "perp", error instanceof Error ? error.message : "Unknown error");
  }
}
