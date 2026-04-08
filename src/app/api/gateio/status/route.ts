import { NextResponse } from "next/server";
import { normalizeNetworkName } from "@/lib/networks";
import { TransferStatus } from "@/lib/types";

const GATEIO_CURRENCIES_URL = "https://api.gateio.ws/api/v4/spot/currencies";

type GateIoCurrency = {
  currency: string;
  deposit_disabled?: boolean;
  withdraw_disabled?: boolean;
  chains?: Array<{
    name?: string;
    deposit_disabled?: boolean;
    withdraw_disabled?: boolean;
  }>;
};

export async function GET() {
  try {
    const response = await fetch(GATEIO_CURRENCIES_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Gate.io status fetch failed: ${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as GateIoCurrency[];
    const data = raw.reduce<Record<string, TransferStatus>>((acc, asset) => {
      acc[asset.currency] = {
        depositEnabled: asset.deposit_disabled === undefined ? null : !asset.deposit_disabled,
        withdrawEnabled: asset.withdraw_disabled === undefined ? null : !asset.withdraw_disabled,
        networks:
          asset.chains?.map((chain) => ({
            networkKey: chain.name ?? "unknown",
            networkLabel: chain.name ?? "Unknown",
            normalizedNetwork: normalizeNetworkName(chain.name),
            depositEnabled: chain.deposit_disabled === undefined ? null : !chain.deposit_disabled,
            withdrawEnabled: chain.withdraw_disabled === undefined ? null : !chain.withdraw_disabled,
          })) ?? [],
      };
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data,
      source: GATEIO_CURRENCIES_URL,
      count: Object.keys(data).length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
