"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const MARKET_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "basis", label: "현선갭" },
  { value: "perp-perp", label: "선선갭" },
  { value: "funding", label: "펀비 차액" },
  { value: "domestic", label: "국내↔해외" },
  { value: "cex-dex", label: "CEX-DEX" },
] as const;

export const EXCHANGE_OPTIONS = [
  "Bithumb",
  "Upbit",
  "Binance",
  "OKX",
  "Bybit",
  "Gate.io",
  "Solana",
  "Hyperliquid",
  "EdgeX",
  "Aster",
] as const;

export const HIGHLIGHT_OPTIONS = ["2", "5", "10"] as const;

export function useDashboardFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const marketType = searchParams.get("marketType") ?? "all";
  const minGap = searchParams.get("minGap") ?? "2";
  const executableOnly = searchParams.get("executableOnly") === "1";
  const networkOnly = searchParams.get("networkOnly") === "1";
  const highlight = searchParams.get("highlight") ?? "2";
  const venues = useMemo(() => (searchParams.get("venues") ?? "").split(",").filter(Boolean), [searchParams]);

  const setParam = useCallback(
    (key: string, value?: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const toggleVenue = useCallback(
    (venue: string) => {
      const next = venues.includes(venue) ? venues.filter((item) => item !== venue) : [...venues, venue];
      setParam("venues", next.length ? next.join(",") : null);
    },
    [setParam, venues]
  );

  return {
    marketType,
    minGap,
    executableOnly,
    networkOnly,
    highlight,
    venues,
    setMarketType: (value: string) => setParam("marketType", value === "all" ? null : value),
    setMinGap: (value: string) => setParam("minGap", value === "2" ? null : value),
    setExecutableOnly: (checked: boolean) => setParam("executableOnly", checked ? "1" : null),
    setNetworkOnly: (checked: boolean) => setParam("networkOnly", checked ? "1" : null),
    setHighlight: (value: string) => setParam("highlight", value === "2" ? null : value),
    toggleVenue,
  };
}
