import { NextResponse } from "next/server";
import { normalizeUpbitSpotTickers } from "@/lib/exchanges";

const UPBIT_TICKER_URL = "https://api.upbit.com/v1/ticker/all?quote_currencies=KRW";
const ORDERBOOK_CHUNK_SIZE = 30;

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function GET() {
  try {
    const tickerResponse = await fetch(UPBIT_TICKER_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!tickerResponse.ok) {
      return NextResponse.json({ success: false, error: `Upbit ticker fetch failed: ${tickerResponse.status}` }, { status: 502 });
    }

    const tickers = (await tickerResponse.json()) as Array<{
      market: string;
      trade_price: number;
      acc_trade_price_24h?: number;
      timestamp?: number;
    }>;

    const krwMarkets = tickers.map((item) => item.market).filter((market) => market.startsWith("KRW-"));
    const orderbookResponses = await Promise.all(
      chunk(krwMarkets, ORDERBOOK_CHUNK_SIZE).map((markets) =>
        fetch(`https://api.upbit.com/v1/orderbook?markets=${markets.join(",")}`, {
          headers: { Accept: "application/json" },
          next: { revalidate: 0 },
        })
      )
    );

    const failedOrderbook = orderbookResponses.find((response) => !response.ok);
    if (failedOrderbook) {
      return NextResponse.json({ success: false, error: `Upbit orderbook fetch failed: ${failedOrderbook.status}` }, { status: 502 });
    }

    const orderbookLists = (await Promise.all(
      orderbookResponses.map((response) =>
        response.json() as Promise<
          Array<{
            market: string;
            orderbook_units?: Array<{
              bid_price: number;
              ask_price: number;
            }>;
          }>
        >
      )
    )) as Array<
      Array<{
        market: string;
        orderbook_units?: Array<{
          bid_price: number;
          ask_price: number;
        }>;
      }>
    >;

    const orderbookMap = orderbookLists.flat().reduce<
      Record<
        string,
        {
          orderbook_units?: Array<{
            bid_price: number;
            ask_price: number;
          }>;
        }
      >
    >((acc, item) => {
      acc[item.market] = item;
      return acc;
    }, {});

    const data = normalizeUpbitSpotTickers(tickers, orderbookMap);

    return NextResponse.json({
      success: true,
      data,
      source: [UPBIT_TICKER_URL, "https://api.upbit.com/v1/orderbook"],
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
