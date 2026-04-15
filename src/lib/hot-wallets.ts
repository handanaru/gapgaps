export type HotWalletTokenConfig = {
  symbol: string;
  contractAddress: string;
  decimals: number;
  threshold: number;
  chainLabel: string;
};

export type ExchangeHotWallet = {
  exchange: string;
  label: string;
  addresses: string[];
};

export const HOT_WALLET_TOKENS: Record<string, HotWalletTokenConfig> = {
  FALCON: {
    symbol: "FLN",
    contractAddress: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    threshold: 100000,
    chainLabel: "Ethereum",
  },
};

export const EXCHANGE_HOT_WALLETS: Record<string, ExchangeHotWallet> = {
  upbitFalcon: {
    exchange: "업비트",
    label: "FALCON 핫월렛",
    addresses: [
      "0x85D0D8278F2A3458571359d3E6931057edfe35d9",
      "0xc318790c6411011d2F32066dF82DBc975200Df58",
    ],
  },
};

export function formatTokenBalance(rawBalance: string, decimals: number) {
  const normalized = rawBalance.replace(/^0+/, "") || "0";
  if (decimals <= 0) return normalized;

  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${Number(whole).toLocaleString()}.${fraction.slice(0, 6)}` : Number(whole).toLocaleString();
}
