export type MarketType = "spot" | "perp";

export type NormalizedTicker = {
  exchange: string;
  marketType: MarketType;
  symbol: string;
  base: string;
  quote: string;
  price: number;
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
