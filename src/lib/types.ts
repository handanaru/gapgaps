export type MarketType = "spot" | "perp";

export type NormalizedTicker = {
  exchange: string;
  marketType: MarketType;
  symbol: string;
  base: string;
  quote: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  volume24h?: number; // in quote currency (KRW for Bithumb, USDT for Binance/OKX)
  metadata?: {
    chainId?: string;
    dexId?: string;
    pairAddress?: string;
    tokenAddress?: string;
    liquidityUsd?: number;
    sourceUrl?: string;
    fundingBaseRate?: number;
    takerFeeRate?: number;
    makerFeeRate?: number;
    maxLeverage?: number;
  };
  timestamp: number;
};

export type ArbitrageOpportunity = {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  gapPct: number;
  referenceGapPct?: number;
  estimatedNetPct: number;
  longLeg: string;
  shortLeg: string;
};

export type TransferStatus = {
  depositEnabled: boolean | null;
  withdrawEnabled: boolean | null;
  minimumWithdrawal?: string | null;
  networks?: TransferNetworkStatus[];
};

export type TransferNetworkStatus = {
  networkKey: string;
  networkLabel: string;
  normalizedNetwork: string | null;
  depositEnabled: boolean | null;
  withdrawEnabled: boolean | null;
  contractAddress?: string | null;
};
