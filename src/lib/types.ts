export type MarketType = "spot" | "perp";

export type NormalizedTicker = {
  exchange: string;
  marketType: MarketType;
  symbol: string;
  base: string;
  quote: string;
  price: number;
  volume24h?: number; // in quote currency (KRW for Bithumb, USDT for Binance/OKX)
  timestamp: number;
};

export type ArbitrageOpportunity = {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  gapPct: number;
  estimatedNetPct: number;
  longLeg: string;
  shortLeg: string;
};
