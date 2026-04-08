import { NextResponse } from "next/server";
import { normalizeNetworkName } from "@/lib/networks";
import { TransferStatus } from "@/lib/types";

const BITHUMB_STATUS_URL = "https://api.bithumb.com/public/assetsstatus/multichain/ALL";
const BITHUMB_WITHDRAW_MIN_URL = "https://api.bithumb.com/public/withdraw/minimum/ALL";

type BithumbStatusResponse = {
  status: string;
  data: Array<{ currency: string; net_type: string; deposit_status: number; withdrawal_status: number }>;
};

type BithumbWithdrawMinimumResponse = {
  status: string;
  data: Array<{ currency: string; minimum: string }>;
};

export async function GET() {
  try {
    const [statusResponse, minimumResponse] = await Promise.all([
      fetch(BITHUMB_STATUS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }),
      fetch(BITHUMB_WITHDRAW_MIN_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }),
    ]);

    if (!statusResponse.ok) {
      return NextResponse.json({ success: false, error: `Bithumb status fetch failed: ${statusResponse.status}` }, { status: 502 });
    }

    if (!minimumResponse.ok) {
      return NextResponse.json({ success: false, error: `Bithumb minimum withdraw fetch failed: ${minimumResponse.status}` }, { status: 502 });
    }

    const raw = (await statusResponse.json()) as BithumbStatusResponse;
    const minimumRaw = (await minimumResponse.json()) as BithumbWithdrawMinimumResponse;
    const minimumMap = (minimumRaw.data ?? []).reduce<Record<string, string>>((acc, item) => {
      if (!(item.currency in acc)) {
        acc[item.currency] = item.minimum;
      }
      return acc;
    }, {});

    const data = (raw.data ?? []).reduce<Record<string, TransferStatus>>((acc, item) => {
      const current = acc[item.currency] ?? {
        depositEnabled: false,
        withdrawEnabled: false,
        minimumWithdrawal: minimumMap[item.currency] ?? null,
        networks: [],
      };

      current.depositEnabled = current.depositEnabled === true || item.deposit_status === 1;
      current.withdrawEnabled = current.withdrawEnabled === true || item.withdrawal_status === 1;
      current.networks = [
        ...(current.networks ?? []),
        {
          networkKey: item.net_type,
          networkLabel: item.net_type,
          normalizedNetwork: normalizeNetworkName(item.net_type),
          depositEnabled: item.deposit_status === 1,
          withdrawEnabled: item.withdrawal_status === 1,
        },
      ];

      acc[item.currency] = current;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data,
      source: [BITHUMB_STATUS_URL, BITHUMB_WITHDRAW_MIN_URL],
      count: Object.keys(data).length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
