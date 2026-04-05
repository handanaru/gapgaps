import { ArbitrageTable } from "@/components/arbitrage-table";
import { KrwPremiumTable } from "@/components/krw-premium-table";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Crypto Arbitrage Dashboard</h1>
        <p className="text-slate-300">
          Phase 1+: Binance Basis + Bithumb(KRW) ↔ OKX(USDT) 김프/차익 기회 모니터링
        </p>
      </header>

      <KrwPremiumTable />
      <ArbitrageTable />
    </main>
  );
}
