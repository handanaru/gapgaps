import { TransferNetworkStatus, TransferStatus } from "@/lib/types";

const NETWORK_ALIAS_MAP: Record<string, string> = {
  ARB_ETH: "arbitrum",
  ARBEVM: "arbitrum",
  ARBITRUM: "arbitrum",
  ARBITRUMONE: "arbitrum",
  ARBNOVA: "arbitrum-nova",
  AVAX_C: "avalanche-c",
  AVAXC: "avalanche-c",
  APT: "aptos",
  APTOS: "aptos",
  BASE: "base",
  BASENET: "base",
  BASE_ETH: "base",
  BASEEVM: "base",
  BSC: "bnb-smart-chain",
  BEP20: "bnb-smart-chain",
  BNB: "bnb-smart-chain",
  BNBSMARTCHAIN: "bnb-smart-chain",
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
  MATIC: "polygon",
  MATICPOS: "polygon",
  POL: "polygon",
  POLYGON: "polygon",
  OP: "optimism",
  OP_ETH: "optimism",
  OPTIMISM: "optimism",
  OSMO: "osmosis",
  OSMOSIS: "osmosis",
  SOL: "solana",
  SPL: "solana",
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
  const key = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

function normalizeContractAddress(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isNetworkContractCompatible(left: TransferNetworkStatus, right: TransferNetworkStatus) {
  const leftContract = normalizeContractAddress(left.contractAddress);
  const rightContract = normalizeContractAddress(right.contractAddress);

  if (!leftContract || !rightContract) {
    return true;
  }

  return leftContract === rightContract;
}

export function getMatchedNetworks(leftStatus: TransferStatus | undefined, rightStatus: TransferStatus | undefined) {
  const leftNetworks = summarizeExecutableNetworks(leftStatus).filter((network) => network.withdrawEnabled === true);
  const rightNetworks = summarizeExecutableNetworks(rightStatus).filter((network) => network.depositEnabled === true);

  return leftNetworks.filter(
    (leftNetwork) =>
      leftNetwork.normalizedNetwork &&
      rightNetworks.some(
        (rightNetwork) => rightNetwork.normalizedNetwork === leftNetwork.normalizedNetwork && isNetworkContractCompatible(leftNetwork, rightNetwork)
      )
  );
}

export function hasContractMismatch(leftStatus: TransferStatus | undefined, rightStatus: TransferStatus | undefined) {
  const leftNetworks = summarizeExecutableNetworks(leftStatus).filter((network) => network.withdrawEnabled === true && network.normalizedNetwork);
  const rightNetworks = summarizeExecutableNetworks(rightStatus).filter((network) => network.depositEnabled === true && network.normalizedNetwork);

  return leftNetworks.some((leftNetwork) => {
    const counterpart = rightNetworks.find((rightNetwork) => rightNetwork.normalizedNetwork === leftNetwork.normalizedNetwork);
    if (!counterpart) return false;

    const leftContract = normalizeContractAddress(leftNetwork.contractAddress);
    const rightContract = normalizeContractAddress(counterpart.contractAddress);
    if (!leftContract || !rightContract) return false;

    return leftContract !== rightContract;
  });
}

export function formatNetworkSummary(networks: TransferNetworkStatus[]) {
  if (networks.length === 0) return "네트워크 정보 없음";

  return networks
    .slice(0, 3)
    .map((network) => network.networkLabel)
    .join(", ");
}
