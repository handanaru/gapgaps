"use client";

import { ReactNode, useMemo, useState } from "react";

const TABS = [
  { key: "price", label: "Price / Gap 차트" },
  { key: "network", label: "Network 진단" },
  { key: "withdrawal", label: "Withdrawal Flow" },
  { key: "orderbook", label: "Order Book" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function OpportunityDetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  renderers,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  renderers: Record<TabKey, ReactNode>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("price");

  const activeContent = useMemo(() => renderers[activeTab], [activeTab, renderers]);

  return (
    <>
      {open ? <button type="button" aria-label="Close detail overlay" onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" /> : null}
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[860px] transform border-l border-white/10 bg-[#0f1013] shadow-2xl shadow-black/40 transition duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">Opportunity Detail</div>
              <h2 className="mt-2 text-xl font-semibold text-white">{title ?? "No selection"}</h2>
              <p className="mt-1 text-sm text-slate-400">{subtitle ?? "카드를 선택하면 상세 차트와 진단 흐름이 열립니다."}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-[#121317] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-[#16181d]"
            >
              닫기
            </button>
          </div>

          <div className="border-b border-white/10 px-5 py-3">
            <div className="inline-flex rounded-xl border border-white/10 bg-[#121317] p-1">
              {TABS.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-[#16181d] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{activeContent}</div>
        </div>
      </aside>
    </>
  );
}
