import { TransferNetworkStatus, TransferStatus } from "@/lib/types";

const NETWORK_ALIAS_MAP: Record<string, string> = {
  ARB_ETH: "arbitrum",
  ARBEVM: "arbitrum",
  ARBITRUM: "arbitrum",
  ARBNOVA: "arbitrum-nova",
  AVAX_C: "avalanche-c",
  AVAXC: "avalanche-c",
  APT: "aptos",
  APTOS: "aptos",
  BASE: "base",
  BASENET: "base",
  BASE_ETH: "base",
  BASEEVM: "base",
  BSC: "bsc",
  BTC: "bitcoin",
  BITCOIN: "bitcoin",
  ADA: "cardano",
  CARDANO: "cardano",
  DOGE: "dogecoin",
  DOGECOIN: "dogecoin",
  ETH: "ethereum",
  ERC20: "ethereum",
  ETHEREUM: "ethereum",
  LINEA: "linea",
  LINEAETH: "linea",
  OP: "optimism",
  OP_ETH: "optimism",
  OPTIMISM: "optimism",
  OSMO: "osmosis",
  OSMOSIS: "osmosis",
  POL: "polygon",
  POLYGON: "polygon",
  SOL: "solana",
  SOLANA: "solana",
  SUI: "sui",
  TON: "ton",
  THEOPENNETWORK: "ton",
  TRX: "tron",
  TRON: "tron",
  XRP: "xrp",
};

export function normalizeNetworkName(value: string | null | undefined) {
  if (!value) return null;
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const alias = NETWORK_ALIAS_MAP[key];
  if (alias) return alias;

  const sanitized = key.replace(/[^A-Z0-9]/g, "");
  if (!sanitized) return null;

  const compactAlias = NETWORK_ALIAS_MAP[sanitized];
  if (compactAlias) return compactAlias;

  return sanitized.toLowerCase();
}

export function summarizeExecutableNetworks(status: TransferStatus | undefined) {
  if (!status?.networks?.length) return [];

  return status.networks.filter((network) => network.depositEnabled === true || network.withdrawEnabled === true);
}

export function getMatchedNetworks(
  leftStatus: TransferStatus | undefined,
  rightStatus: TransferStatus | undefined
) {
  const leftNetworks = summarizeExecutableNetworks(leftStatus).filter((network) => network.withdrawEnabled === true);
  const rightNetworks = summarizeExecutableNetworks(rightStatus).filter((network) => network.depositEnabled === true);
  const rightSet = new Set(rightNetworks.map((network) => network.normalizedNetwork).filter(Boolean));

  return leftNetworks.filter((network) => network.normalizedNetwork && rightSet.has(network.normalizedNetwork));
}

export function formatNetworkSummary(networks: TransferNetworkStatus[]) {
  if (networks.length === 0) return "네트워크 정보 없음";
  return networks
    .slice(0, 3)
    .map((network) => network.networkLabel)
    .join(", ");
}
