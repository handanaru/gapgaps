import { normalizeNetworkName } from "@/lib/networks";
import { DexTokenMetadata } from "@/lib/dex-tokens";
import { TransferNetworkStatus, TransferStatus } from "@/lib/types";

export type DexExecutionCode =
  | "chain-unresolved"
  | "missing-cex-status"
  | "network-mismatch"
  | "withdraw-disabled"
  | "deposit-disabled"
  | "deposit-withdraw-disabled"
  | "ready";

export type DexExecutionStatus = {
  symbol: string;
  chainId: string;
  normalizedChain: string | null;
  matchedNetworks: TransferNetworkStatus[];
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  executable: boolean;
  status: "executable" | "reference-only" | "blocked";
  code: DexExecutionCode;
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
      code: "chain-unresolved",
      reason: "DEX 체인 정규화 실패",
    };
  }

  if (!cexStatus?.networks?.length) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks: [],
      depositEnabled: false,
      withdrawEnabled: false,
      executable: false,
      status: "reference-only",
      code: "missing-cex-status",
      reason: "CEX 전송 상태 데이터 없음",
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
      code: "network-mismatch",
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
      code: "ready",
      reason: "공통 네트워크 입출금 가능",
    };
  }

  if (!withdrawEnabled && !depositEnabled) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks,
      depositEnabled,
      withdrawEnabled,
      executable: false,
      status: "reference-only",
      code: "deposit-withdraw-disabled",
      reason: "공통 네트워크는 있으나 입출금 모두 불가",
    };
  }

  if (!withdrawEnabled) {
    return {
      symbol: dexToken.symbol,
      chainId: dexToken.chainId,
      normalizedChain,
      matchedNetworks,
      depositEnabled,
      withdrawEnabled,
      executable: false,
      status: "reference-only",
      code: "withdraw-disabled",
      reason: "빗썸 출금 불가",
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
    code: "deposit-disabled",
    reason: "반대편 입금 불가",
  };
}
