import { NextResponse } from "next/server";

export function createBlockedExchangeResponse(exchange: string, market: string, error: string) {
  const isBlocked = error.includes("403") || error.includes("451");

  return NextResponse.json(
    {
      success: isBlocked,
      disabled: isBlocked,
      data: [],
      error,
      exchange,
      market,
      fetchedAt: Date.now(),
    },
    { status: isBlocked ? 200 : 500 }
  );
}
