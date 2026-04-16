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

export function getAssetIdentityKey(exchange: string, base: string) {
  return EXCHANGE_ASSET_ID_OVERRIDES[exchange]?.[base] ?? `${base.toLowerCase()}:default`;
}

export function isSameAsset(left: NormalizedTicker, right: NormalizedTicker) {
  return getAssetIdentityKey(left.exchange, left.base) === getAssetIdentityKey(right.exchange, right.base);
}
