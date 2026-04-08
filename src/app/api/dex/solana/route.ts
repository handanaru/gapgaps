import { NextResponse } from "next/server";
import { normalizeNetworkName } from "@/lib/networks";
import { NormalizedTicker } from "@/lib/types";

const BITHUMB_SPOT_URL = "https://api.bithumb.com/public/ticker/ALL_KRW";
const BITHUMB_MULTICHAIN_URL = "https://api.bithumb.com/public/assetsstatus/multichain/ALL";
const JUPITER_SEARCH_URL = "https://api.jup.ag/tokens/v2/search?query=";
const DEX_TOKEN_URL = "https://api.dexscreener.com/tokens/v1/solana/";
const MIN_DEX_LIQUIDITY_USD = 10_000;
const JUPITER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const JUPITER_RETRY_DELAY_MS = 600;
const JUPITER_CONCURRENCY = 2;

const verifiedMintCache = new Map<string, { mintAddress: string | null; expiresAt: number }>();

type JupiterToken = {
  id: string;
  name?: string;
  symbol?: string;
  isVerified?: boolean;
};

type DexScreenerPair = {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { symbol?: string };
};

type BithumbSpotResponse = {
  status: string;
  data: Record<string, { closing_price: string }>;
};

type BithumbMultichainResponse = {
  status: string;
  data: Array<{ currency: string; net_type: string }>;
};

function pickBestSolanaPair(mintAddress: string, pairs: DexScreenerPair[]) {
  return pairs
    .filter((pair) => pair.chainId === "solana")
    .filter((pair) => pair.baseToken?.address === mintAddress)
    .filter((pair) => {
      const quote = pair.quoteToken?.symbol?.toUpperCase();
      return quote === "SOL" || quote === "USDC";
    })
    .filter((pair) => Number(pair.liquidity?.usd) >= MIN_DEX_LIQUIDITY_USD)
    .sort((left, right) => Number(right.liquidity?.usd ?? 0) - Number(left.liquidity?.usd ?? 0))[0];
}

function getVerifiedMintAddress(symbol: string, tokens: JupiterToken[]) {
  const exactMatches = tokens.filter(
    (token) => token.isVerified === true && token.symbol?.toUpperCase() === symbol && Boolean(token.id)
  );
  const uniqueMintAddresses = Array.from(new Set(exactMatches.map((token) => token.id)));
  return uniqueMintAddresses.length === 1 ? uniqueMintAddresses[0] : null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJupiterTokens(symbol: string, headers: Record<string, string>) {
  const response = await fetch(`${JUPITER_SEARCH_URL}${encodeURIComponent(symbol)}`, {
    headers,
    next: { revalidate: 60 * 60 },
  });

  if (response.status === 429) {
    await sleep(JUPITER_RETRY_DELAY_MS);
    const retryResponse = await fetch(`${JUPITER_SEARCH_URL}${encodeURIComponent(symbol)}`, {
      headers,
      next: { revalidate: 60 * 60 },
    });

    if (!retryResponse.ok) return null;
    return (await retryResponse.json()) as JupiterToken[];
  }

  if (!response.ok) return null;
  return (await response.json()) as JupiterToken[];
}

async function resolveVerifiedMint(symbol: string, headers: Record<string, string>) {
  const cached = verifiedMintCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.mintAddress;
  }

  const tokens = await fetchJupiterTokens(symbol, headers);
  const mintAddress = tokens ? getVerifiedMintAddress(symbol, tokens) : null;
  verifiedMintCache.set(symbol, { mintAddress, expiresAt: Date.now() + JUPITER_CACHE_TTL_MS });
  return mintAddress;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function GET() {
  try {
    const [spotResponse, multichainResponse] = await Promise.all([
      fetch(BITHUMB_SPOT_URL, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 30 },
      }),
      fetch(BITHUMB_MULTICHAIN_URL, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 30 },
      }),
    ]);

    if (!spotResponse.ok || !multichainResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Bithumb source fetch failed: ${spotResponse.status}/${multichainResponse.status}`,
        },
        { status: 502 }
      );
    }

    const spotRaw = (await spotResponse.json()) as BithumbSpotResponse;
    const multichainRaw = (await multichainResponse.json()) as BithumbMultichainResponse;

    const bithumbSpotSymbols = new Set(Object.keys(spotRaw.data ?? {}).filter((symbol) => symbol !== "date"));
    const solanaSymbols = Array.from(
      new Set(
        (multichainRaw.data ?? [])
          .filter((item) => normalizeNetworkName(item.net_type) === "solana")
          .map((item) => item.currency)
          .filter((symbol) => bithumbSpotSymbols.has(symbol))
      )
    );

    const jupiterApiKey = process.env.JUP_API_KEY;
    const jupiterHeaders: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    };
    if (jupiterApiKey) {
      jupiterHeaders["x-api-key"] = jupiterApiKey;
    }

    const verifiedMints = await mapWithConcurrency(
      solanaSymbols,
      JUPITER_CONCURRENCY,
      async (symbol) => ({ symbol, mintAddress: await resolveVerifiedMint(symbol, jupiterHeaders) })
    );

    const searchResults = await Promise.all(
      verifiedMints.flatMap(({ symbol, mintAddress }) => {
        if (!mintAddress) return [];
        return [mintAddress].map(async (resolvedMintAddress) => {
        const dexResponse = await fetch(`${DEX_TOKEN_URL}${mintAddress}`, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 30 },
        });

        if (!dexResponse.ok) return null;
        const dexPairs = (await dexResponse.json()) as DexScreenerPair[];
          const bestPair = pickBestSolanaPair(resolvedMintAddress, dexPairs);

          return bestPair ? { symbol, mintAddress: resolvedMintAddress, pair: bestPair } : null;
        });
      })
    );

    const data = searchResults.reduce<NormalizedTicker[]>((acc, result) => {
      const pair = result?.pair;
      const symbol = result?.symbol;
      const mintAddress = result?.mintAddress;
      const price = Number(pair?.priceUsd);
      if (!pair || !symbol || !mintAddress || !Number.isFinite(price) || price <= 0) return acc;

      acc.push({
        exchange: "Solana DEX",
        marketType: "spot",
        symbol: `${symbol}USDT`,
        base: symbol,
        quote: "USDT",
        price,
        volume24h: Number.isFinite(Number(pair.volume?.h24)) ? Number(pair.volume?.h24) : undefined,
        metadata: {
          chainId: pair.chainId,
          dexId: pair.dexId,
          pairAddress: pair.pairAddress,
          tokenAddress: mintAddress,
          liquidityUsd: Number.isFinite(Number(pair.liquidity?.usd)) ? Number(pair.liquidity?.usd) : undefined,
          sourceUrl: pair.url ?? `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
        },
        timestamp: Date.now(),
      });
      return acc;
    }, []);

    return NextResponse.json({
      success: true,
      data,
      source: {
        bithumb: [BITHUMB_SPOT_URL, BITHUMB_MULTICHAIN_URL],
        mintResolver: JUPITER_SEARCH_URL,
        dex: DEX_TOKEN_URL,
      },
      count: data.length,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
