import { normalizeNetworkName } from "@/lib/networks";
import { DexTokenMetadata } from "@/lib/dex-tokens";
import { TransferNetworkStatus, TransferStatus } from "@/lib/types";

export type DexExecutionStatus = {
  symbol: string;
  chainId: string;
  normalizedChain: string | null;
  matchedNetworks: TransferNetworkStatus[];
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  executable: boolean;
  status: "executable" | "reference-only" | "blocked";
  reason: string;
};

export function getDexCexMatchedNetworks(dexToken: DexTokenMetadata, cexStatus: TransferStatus | undefined) {
  const normalizedChain = normalizeNetworkName(dexToken.chainId);
  if (!normalizedChain || !cexStatus?.networks?.length) {
    return [];
  }

  return cexStatus.networks.filter((network) => network.normalizedNetwork === normalizedChain);
}

export function getDexExecutionStatus(dexToken: DexTokenMetadata, cexStatus: TransferStatus | undefined): DexExecutionStatus {
  const normalizedChain = normalizeNetworkName(dexToken.chainId);
  const matchedNetworks = getDexCexMatchedNetworks(dexToken, cexStatus);
  const withdrawEnabled = matchedNetworks.some((network) => network.withdrawEnabled === true);
  const depositEnabled = matchedNetworks.some((network) => network.depositEnabled === true);

  if (!normalizedChain) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks: [],
      depositEnabled: false,
      withdrawEnabled: false,
      executable: false,
      status: "blocked",
      reason: "DEX 체인 정규화 실패",
    };
  }

  if (matchedNetworks.length === 0) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks: [],
      depositEnabled: false,
      withdrawEnabled: false,
      executable: false,
      status: "blocked",
      reason: "공통 네트워크 없음",
    };
  }

  if (depositEnabled && withdrawEnabled) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks,
      depositEnabled,
      withdrawEnabled,
      executable: true,
      status: "executable",
      reason: "공통 네트워크 입출금 가능",
    };
  }

  return {
    symbol: dexToken.symbol,
    chainId: dexToken.chainId,
    normalizedChain,
    matchedNetworks,
    depositEnabled,
    withdrawEnabled,
    executable: false,
    status: "reference-only",
    reason: "공통 네트워크는 있으나 입출금 상태 미완전",
  };
}
