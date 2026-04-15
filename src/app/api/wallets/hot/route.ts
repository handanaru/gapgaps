import { NextResponse } from "next/server";
import { EXCHANGE_HOT_WALLETS, HOT_WALLET_TOKENS, formatTokenBalance } from "@/lib/hot-wallets";

const ETHERSCAN_API_URL = "https://api.etherscan.io/api";

type EtherscanBalanceResponse = {
  status: string;
  message: string;
  result: string;
};

function compareRawBalance(rawBalance: string, threshold: number, decimals: number) {
  const thresholdRaw = BigInt(Math.round(threshold * 10 ** Math.min(decimals, 6))) * BigInt(10 ** Math.max(decimals - 6, 0));
  const balanceRaw = BigInt(rawBalance || "0");
  return balanceRaw < thresholdRaw;
}

async function fetchTokenBalance(address: string, contractAddress: string, apiKey: string) {
  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokenbalance");
  url.searchParams.set("contractaddress", contractAddress);
  url.searchParams.set("address", address);
  url.searchParams.set("tag", "latest");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`Etherscan fetch failed: ${response.status}`);
  }

  return (await response.json()) as EtherscanBalanceResponse;
}

export async function GET() {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: true,
      disabled: true,
      error: "Missing ETHERSCAN_API_KEY",
      data: [],
      formatted: "Etherscan API 키가 없어 핫월렛 잔고 조회가 비활성화되어 있습니다.",
    });
  }

  try {
    const walletEntries = Object.entries(EXCHANGE_HOT_WALLETS);
    const tokenEntries = Object.entries(HOT_WALLET_TOKENS);

    const data = await Promise.all(
      walletEntries.flatMap(([walletKey, wallet]) =>
        tokenEntries.map(async ([tokenKey, token]) => {
          const balances = await Promise.all(
            wallet.addresses.map(async (address) => {
              const json = await fetchTokenBalance(address, token.contractAddress, apiKey);
              const rawBalance = json.result ?? "0";
              const formattedBalance = formatTokenBalance(rawBalance, token.decimals);
              const lowBalance = compareRawBalance(rawBalance, token.threshold, token.decimals);

              return {
                address,
                rawBalance,
                formattedBalance,
                lowBalance,
              };
            })
          );

          return {
            walletKey,
            tokenKey,
            exchange: wallet.exchange,
            label: wallet.label,
            tokenSymbol: token.symbol,
            threshold: token.threshold,
            chainLabel: token.chainLabel,
            contractAddress: token.contractAddress,
            balances,
          };
        })
      )
    );

    const formatted = data
      .map((entry) => {
        const lines = [`[${entry.exchange}] ${entry.label}`, `토큰: ${entry.tokenSymbol} · 체인: ${entry.chainLabel}`, `컨트랙트: ${entry.contractAddress}`];
        entry.balances.forEach((balance) => {
          lines.push(`주소: ${balance.address}`);
          lines.push(`잔고: ${balance.formattedBalance} ${entry.tokenSymbol}`);
          if (balance.lowBalance) {
            lines.push(`⚠️ 잔고 부족 (임계값 ${entry.threshold.toLocaleString()} ${entry.tokenSymbol} 이하)`);
          }
          lines.push("");
        });
        return lines.join("\n").trim();
      })
      .join("\n\n");

    return NextResponse.json({
      success: true,
      data,
      formatted,
      source: ETHERSCAN_API_URL,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
