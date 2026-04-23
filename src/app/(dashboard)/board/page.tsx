import { Suspense } from "react";
import { PreviewBoardTabs, type BoardTabItem } from "@/components/board/PreviewBoardTabs";

const BOARD_TABS: BoardTabItem[] = [
  {
    id: "basis-binance",
    label: "Binance Basis",
    title: "Binance Spot vs Futures",
    description: "기존 Basis Board의 Binance 현선갭 상세 비교 탭입니다.",
    countHint: "basis",
  },
  {
    id: "basis-okx",
    label: "OKX Basis",
    title: "OKX Spot vs Perp",
    description: "기존 Basis Board의 OKX 현선갭 상세 비교 탭입니다.",
    countHint: "basis",
  },
  {
    id: "perp-binance-okx",
    label: "Binance ↔ OKX",
    title: "Binance Perp vs OKX Swap",
    description: "기존 선선갭 상세 비교 보드를 /board 탭으로 옮기는 첫 그룹입니다.",
    countHint: "perp-perp",
  },
  {
    id: "perp-binance-bybit",
    label: "Binance ↔ Bybit",
    title: "Binance Perp vs Bybit Perp",
    description: "Binance / Bybit 선선갭 상세 비교 탭입니다.",
    countHint: "perp-perp",
  },
  {
    id: "perp-binance-gateio",
    label: "Binance ↔ Gate",
    title: "Binance Perp vs Gate.io Perp",
    description: "Binance / Gate.io 선선갭 상세 비교 탭입니다.",
    countHint: "perp-perp",
  },
  {
    id: "perp-binance-hyperliquid",
    label: "Binance ↔ Hyperliquid",
    title: "Binance Perp vs Hyperliquid Perp",
    description: "Perp DEX 비교용 Hyperliquid 상세 탭입니다.",
    countHint: "perp-dex",
  },
  {
    id: "perp-binance-edgex",
    label: "Binance ↔ EdgeX",
    title: "Binance Perp vs EdgeX Perp",
    description: "Perp DEX 비교용 EdgeX 상세 탭입니다.",
    countHint: "perp-dex",
  },
  {
    id: "perp-binance-aster",
    label: "Binance ↔ Aster",
    title: "Binance Perp vs Aster Perp",
    description: "Perp DEX 비교용 Aster 상세 탭입니다.",
    countHint: "perp-dex",
  },
  {
    id: "cex-bithumb-binance",
    label: "Bithumb ↔ Binance",
    title: "Bithumb KRW vs Binance Spot",
    description: "국내↔해외 CEX 상세 비교 탭입니다.",
    countHint: "domestic",
  },
  {
    id: "cex-upbit-binance",
    label: "Upbit ↔ Binance",
    title: "Upbit KRW vs Binance Spot",
    description: "업비트 기준 국내↔해외 CEX 상세 비교 탭입니다.",
    countHint: "domestic",
  },
  {
    id: "cex-dex-solana",
    label: "Bithumb ↔ Solana DEX",
    title: "Bithumb KRW vs Solana DEX",
    description: "CEX-DEX 상세 비교 탭입니다.",
    countHint: "cex-dex",
  },
];

export default function BoardPage() {
  return (
    <main className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-[#121317] p-6 shadow-lg shadow-slate-950/40">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">Board</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Detail comparison board</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          기존 Radar 탭에서 세로로 쌓이던 Preview Board들을 /board에서 탭 하나씩 보는 구조로 옮깁니다. Step 8에서는 먼저 탭 스위처와 상세 패널 셸을 만듭니다.
        </p>
      </section>

      <Suspense fallback={<div className="rounded-xl border border-white/10 bg-[#121317] p-5 text-sm text-slate-500">Loading board tabs…</div>}>
        <PreviewBoardTabs tabs={BOARD_TABS} />
      </Suspense>
    </main>
  );
}
