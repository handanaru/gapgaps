import { NormalizedTicker } from "@/lib/types";

type ExchangeAssetMap = Record<string, string>;

const EXCHANGE_ASSET_ID_OVERRIDES: Record<string, ExchangeAssetMap> = {
  Bithumb: {
    BEAM: "beam:erc20",
  },
  Upbit: {
    BEAM: "beam:erc20",
  },
  "Gate.io": {
    BEAM: "beam:native",
    EDGE: "edge:gateio",
  },
  OKX: {
    EDGE: "edge:okx",
  },
};

const BLOCKED_CROSS_EXCHANGE_PAIRS: Record<string, Set<string>> = {
  "Bithumb|Gate.io": new Set([
    "A","ADA","AERGO","ANC","ATD","BEAM","BFC","BLACK","BTR","CHZ","COS","DON","DOT","EGG","EOSDAC","ES","FITFI","GAS","GTC","HEMI","HIGH","HVH","IOTA","IRYS","JOE","KSM","LWA","MBL","MEETONE","NEO","NSBT","NXPC","ONG","ONT","ONX","OP","PEPPER","PROMPT","PUMPBTC","QI","SGB","SIX","SNS","SOLO","SPACE","SPURS","SRT","STABLE","STRK","TALK","THE","WCT","WIKEN","ZBT","ZK","ZRC"
  ]),
  "Bithumb|Binance": new Set([
    "A","ADA","AERGO","ALLO","ANC","AR","ATD","ATH","BEAM","BOBA","CBK","CHZ","COS","DON","DOOD","ELF","FLR","G","GAS","HOOK","JOE","KAT","KLY","KSM","LIT","MANTA","MEETONE","MERL","MNT","MTL","NEO","NSBT","NXPC","ONX","PURSE","QI","QKC","REI","RON","S","SCR","SGB","SNS","SNT","SOLO","WAVES","WAXP","XPL","XPR","ZK","ZRC"
  ]),
  "OKX|Gate.io": new Set(["EDGE"]),
};

function getPairKey(leftExchange: string, rightExchange: string) {
  return [leftExchange, rightExchange].sort().join("|");
}

export function isBlockedCrossExchangeSymbol(leftExchange: string, rightExchange: string, base: string) {
  return BLOCKED_CROSS_EXCHANGE_PAIRS[getPairKey(leftExchange, rightExchange)]?.has(base) ?? false;
}

export function getAssetIdentityKey(exchange: string, base: string) {
  return EXCHANGE_ASSET_ID_OVERRIDES[exchange]?.[base] ?? `${base.toLowerCase()}:default`;
}

export function isSameAsset(left: NormalizedTicker, right: NormalizedTicker) {
  if (isBlockedCrossExchangeSymbol(left.exchange, right.exchange, left.base)) {
    return false;
  }
  return getAssetIdentityKey(left.exchange, left.base) === getAssetIdentityKey(right.exchange, right.base);
}
