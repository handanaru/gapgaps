export type DexWatchlistItem = {
  symbol: string;
  chainId: "solana";
  tokenAddress: string;
  label: string;
};

export const SOLANA_DEX_WATCHLIST: DexWatchlistItem[] = [
  {
    symbol: "GOAT",
    chainId: "solana",
    tokenAddress: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    label: "Goatseus Maximus",
  },
  {
    symbol: "BONK",
    chainId: "solana",
    tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    label: "Bonk",
  },
  {
    symbol: "JUP",
    chainId: "solana",
    tokenAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    label: "Jupiter",
  },
];
