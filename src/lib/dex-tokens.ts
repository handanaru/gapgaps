export type DexChainId = "solana" | "ethereum" | "base" | "arbitrum" | "polygon" | "bnb-smart-chain";

export type DexTokenMetadata = {
  symbol: string;
  name: string;
  chainId: DexChainId;
  contractAddress: string;
  decimals?: number;
  cexSymbols?: string[];
  tags?: string[];
};

export const DEX_TOKEN_REGISTRY: DexTokenMetadata[] = [
  {
    symbol: "GOAT",
    name: "Goatseus Maximus",
    chainId: "solana",
    contractAddress: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    cexSymbols: ["GOAT"],
    tags: ["solana"],
  },
  {
    symbol: "BONK",
    name: "Bonk",
    chainId: "solana",
    contractAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    cexSymbols: ["BONK"],
    tags: ["solana", "meme"],
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    chainId: "solana",
    contractAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    cexSymbols: ["JUP"],
    tags: ["solana", "dex"],
  },
];

export function getDexTokenBySymbol(symbol: string) {
  return DEX_TOKEN_REGISTRY.find((token) => token.symbol === symbol.toUpperCase()) ?? null;
}

export function getDexTokensByChain(chainId: DexChainId) {
  return DEX_TOKEN_REGISTRY.filter((token) => token.chainId === chainId);
}
