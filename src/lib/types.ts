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
  spotPrice: number;
  futuresPrice: number;
  gapPct: number;
  estimatedNetPct: number;
  longLeg: string;
  shortLeg: string;
};
