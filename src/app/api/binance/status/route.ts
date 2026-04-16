import { NextResponse } from "next/server";
import https from "https";
import { normalizeNetworkName } from "@/lib/networks";
import { TransferStatus } from "@/lib/types";

const BINANCE_STATUS_URL = "https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll";

export const runtime = "nodejs";

type BinanceNetwork = {
  network?: string;
  networkDisplay?: string;
  depositEnable?: boolean;
  withdrawEnable?: boolean;
  contractAddress?: string;
  contractAddr?: string;
};

type BinanceAsset = {
  coin: string;
  depositAllEnable?: boolean;
  withdrawAllEnable?: boolean;
  networkList?: BinanceNetwork[];
};

type BinanceStatusResponse = {
  code: string;
  data: BinanceAsset[];
};

function requestJson<T>(url: string) {
  return new Promise<T>((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
          },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`Binance status fetch failed: ${response.statusCode ?? "unknown"}`));
              return;
            }

            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on("error", reject);
  });
}

export async function GET() {
  try {
    const raw = await requestJson<BinanceStatusResponse>(BINANCE_STATUS_URL);
    const data = (raw.data ?? []).reduce<Record<string, TransferStatus>>((acc, asset) => {
      const depositEnabled = asset.depositAllEnable ?? asset.networkList?.some((network) => network.depositEnable === true) ?? null;
      const withdrawEnabled = asset.withdrawAllEnable ?? asset.networkList?.some((network) => network.withdrawEnable === true) ?? null;

      acc[asset.coin] = {
        depositEnabled,
        withdrawEnabled,
        networks:
          asset.networkList?.map((network) => ({
            networkKey: network.network ?? network.networkDisplay ?? "unknown",
            networkLabel: network.networkDisplay ?? network.network ?? "Unknown",
            normalizedNetwork: normalizeNetworkName(network.networkDisplay ?? network.network ?? null),
            depositEnabled: network.depositEnable ?? null,
            withdrawEnabled: network.withdrawEnable ?? null,
            contractAddress: network.contractAddress ?? network.contractAddr ?? null,
          })) ?? [],
      };
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data,
      source: BINANCE_STATUS_URL,
      count: Object.keys(data).length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
