export type DexChainId = "solana" | "ethereum" | "base" | "arbitrum" | "polygon" | "bnb-smart-chain";

export type DexTokenMetadata = {
  symbol: string;
  name: string;
  chainId: DexChainId;
  contractAddress: string;
  decimals?: number;
  cexSymbols?: string[];
  tags?: string[];
  notes?: string;
};

export const DEX_TOKEN_REGISTRY: DexTokenMetadata[] = [
  {
    symbol: "GOAT",
    name: "Goatseus Maximus",
    chainId: "solana",
    contractAddress: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    cexSymbols: ["GOAT"],
    tags: ["solana", "meme"],
    notes: "Bithumb Solana multichain 대상 확인용",
  },
  {
    symbol: "BONK",
    name: "Bonk",
    chainId: "solana",
    contractAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    cexSymbols: ["BONK"],
    tags: ["solana", "meme"],
    notes: "대표 Solana 밈 토큰",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    chainId: "solana",
    contractAddress: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    cexSymbols: ["JUP"],
    tags: ["solana", "dex"],
    notes: "Jupiter 생태계 토큰",
  },
  {
    symbol: "KMNO",
    name: "Kamino",
    chainId: "solana",
    contractAddress: "KMNoYxB2K3z2wFSZp6kyR3B6z9YjRzCQXDpUe1koXEA",
    cexSymbols: ["KMNO"],
    tags: ["solana", "defi"],
    notes: "Kamino lending / vault",
  },
  {
    symbol: "DRIFT",
    name: "Drift",
    chainId: "solana",
    contractAddress: "DriFtUp6m8sErnKjz19RZk9sqnX5nGooy2cwrRez2uM",
    cexSymbols: ["DRIFT"],
    tags: ["solana", "perp"],
    notes: "Solana perp DEX 관련 토큰",
  },
  {
    symbol: "PYTH",
    name: "Pyth Network",
    chainId: "solana",
    contractAddress: "HZ1JovNiVvGrGNiiYv7oMBBceM2xj7zqQK4qpP62b4jk",
    cexSymbols: ["PYTH"],
    tags: ["solana", "oracle"],
    notes: "대형 Solana 오라클 토큰",
  },
  {
    symbol: "RAY",
    name: "Raydium",
    chainId: "solana",
    contractAddress: "4k3Dyjzvzp8eMZWUXb8sJsmdaJYwP9k3EDw9c1gPjvQk",
    cexSymbols: ["RAY"],
    tags: ["solana", "dex"],
    notes: "대표 Solana AMM / DEX",
  },
  {
    symbol: "ORCA",
    name: "Orca",
    chainId: "solana",
    contractAddress: "orcaEKTdKb3hB4T2a6Q2x6P1e8mS8YQ2g1Hh8D7cPzr",
    cexSymbols: ["ORCA"],
    tags: ["solana", "dex"],
    notes: "Solana AMM / concentrated liquidity",
  },
  {
    symbol: "WIF",
    name: "dogwifhat",
    chainId: "solana",
    contractAddress: "EKpQGSJtjMFqKZ4id2z6QhE3F9z2Jw7dBDEuDfSUdif",
    cexSymbols: ["WIF"],
    tags: ["solana", "meme"],
    notes: "대표 Solana 밈코인",
  },
  {
    symbol: "POPCAT",
    name: "Popcat",
    chainId: "solana",
    contractAddress: "7GCihgDB8fe6KnxXJo84rWwJ7cKxYJv7U8G4JwqJ3G9a",
    cexSymbols: ["POPCAT"],
    tags: ["solana", "meme"],
    notes: "Solana 밈코인 후보",
  },
  {
    symbol: "PENGU",
    name: "Pudgy Penguins",
    chainId: "solana",
    contractAddress: "2zMMhcV8PaVw4e8fRkYVabDFJQw6jWwH9hYzu3n6PvJE",
    cexSymbols: ["PENGU"],
    tags: ["solana", "meme"],
    notes: "Pudgy Penguins 관련 토큰",
  },
  {
    symbol: "GRASS",
    name: "Grass",
    chainId: "solana",
    contractAddress: "GRASS7zjV3f5Y7vC18JNpDutLCRa14Q6gttxyPjdvVSx",
    cexSymbols: ["GRASS"],
    tags: ["solana", "depin"],
    notes: "Solana 계열 DePIN 화제 토큰",
  },
];

export function getDexTokenBySymbol(symbol: string) {
  return DEX_TOKEN_REGISTRY.find((token) => token.symbol === symbol.toUpperCase()) ?? null;
}

export function getDexTokensByChain(chainId: DexChainId) {
  return DEX_TOKEN_REGISTRY.filter((token) => token.chainId === chainId);
}
