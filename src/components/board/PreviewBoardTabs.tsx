"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type BoardTabItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  countHint?: string;
};

export function PreviewBoardTabs({ tabs }: { tabs: BoardTabItem[] }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const activeTab = useMemo(() => {
    const current = searchParams.get("tab");
    return tabs.some((tab) => tab.id === current) ? current! : tabs[0]?.id;
  }, [searchParams, tabs]);

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-[#121317] p-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set("tab", tab.id);
                router.replace(`${pathname}?${next.toString()}`, { scroll: false });
              }}
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

      {tabs.map((tab) => {
        if (tab.id !== activeTab) return null;
        return (
          <div key={tab.id} className="rounded-xl border border-white/10 bg-[#121317] p-5 shadow-lg shadow-slate-950/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">Preview Board</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{tab.title}</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">{tab.description}</p>
              </div>
              {tab.countHint ? <div className="rounded-full border border-white/10 bg-[#16181d] px-3 py-2 text-xs text-slate-400">{tab.countHint}</div> : null}
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-[#0f1013] px-4 py-10 text-center text-sm text-slate-500">
              Step 8 scaffold: 이 탭에는 기존 Preview Board 상세 비교가 한 번에 하나씩 렌더됩니다.
              <div className="mt-2 text-xs text-slate-600">다음 단계에서 Radar 카드 클릭 시 이 탭이 자동 선택되도록 연결합니다.</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
