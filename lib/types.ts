export type ExchangeId =
  | "binance-spot"
  | "binance-perp"
  | "bithumb-spot"
  | "okx-spot"
  | "fx-usdkrw";

export type BinanceTicker = {
  symbol: string;
  price: string;
};

export type BithumbAllTickerResponse = {
  status: string;
  data: Record<
    string,
    {
      opening_price: string;
      closing_price: string;
      min_price: string;
      max_price: string;
      units_traded: string;
      acc_trade_value: string;
      prev_closing_price: string;
      units_traded_24H: string;
      acc_trade_value_24H: string;
      fluctate_24H: string;
      fluctate_rate_24H: string;
    } | string
  >;
};

export type OkxTickersResponse = {
  code: string;
  msg: string;
  data: Array<{
    instId: string;
    last: string;
    ts: string;
  }>;
};

export type NormalizedMarketTicker = {
  exchange: ExchangeId;
  symbol: string;
  base: string;
  quote: string;
  price: number;
  timestamp: number;
};

export type NormalizedTicker = {
  symbol: string;
  price: number;
};

export type ArbitrageOpportunity = {
  symbol: string;
  spotPrice: number;
  perpPrice: number;
  gapPct: number;
  feePct: number;
  netPct: number;
  direction: "Buy Spot / Sell Perp" | "Sell Spot / Buy Perp";
};

export type KrwPremiumOpportunity = {
  base: string;
  bithumbSymbol: string;
  okxSymbol: string;
  bithumbKrw: number;
  okxUsdt: number;
  usdKrw: number;
  okxKrw: number;
  premiumPct: number;
  feePct: number;
  netPct: number;
  direction: "Buy OKX / Sell Bithumb" | "Buy Bithumb / Sell OKX";
};
