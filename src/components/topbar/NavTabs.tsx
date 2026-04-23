"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Radar" },
  { href: "/board", label: "Board" },
  { href: "/matrix", label: "Matrix" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-slate-950/80 p-1 shadow-lg shadow-slate-950/30">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-slate-800 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
