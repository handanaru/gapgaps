import { NextResponse } from "next/server";
import { sanitizeUsdKrw } from "@/lib/fx";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

type FxResponse = {
  rates?: {
    KRW?: number;
  };
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch USD/KRW rate" },
        { status: res.status, headers: CORS_HEADERS }
      );
    }

    const data = (await res.json()) as FxResponse;
    const usdKrw = sanitizeUsdKrw(data.rates?.KRW);

    return NextResponse.json(
      {
        exchange: "fx-usdkrw",
        updatedAt: new Date().toISOString(),
        usdKrw
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching USD/KRW rate" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
