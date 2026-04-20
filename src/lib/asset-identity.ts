import { TransferStatus } from "@/lib/types";

const NATIVE_NETWORKS = new Set(["bitcoin", "xrp", "tron", "ton", "solana", "sui", "aptos", "cardano", "dogecoin", "beam"]);

function normalizeContract(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function getExecutableNetworks(status: TransferStatus | undefined, direction: "withdraw" | "deposit") {
  if (!status?.networks?.length) return [];
  return status.networks.filter((network) => (direction === "withdraw" ? network.withdrawEnabled === true : network.depositEnabled === true) && network.normalizedNetwork);
}

export function hasVerifiedAssetIdentity(leftStatus: TransferStatus | undefined, rightStatus: TransferStatus | undefined) {
  const leftNetworks = getExecutableNetworks(leftStatus, "withdraw");
  const rightNetworks = getExecutableNetworks(rightStatus, "deposit");

  for (const left of leftNetworks) {
    const right = rightNetworks.find((candidate) => candidate.normalizedNetwork === left.normalizedNetwork);
    if (!right || !left.normalizedNetwork) continue;

    const leftContract = normalizeContract(left.contractAddress);
    const rightContract = normalizeContract(right.contractAddress);

    if (leftContract && rightContract && leftContract === rightContract) {
      return true;
    }

    if (!leftContract && !rightContract && NATIVE_NETWORKS.has(left.normalizedNetwork)) {
      return true;
    }
  }

  return false;
}
