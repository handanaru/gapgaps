"use client";

import { createContext, useContext, useMemo, useState } from "react";

type AuxActionItem = {
  id: string;
  title: string;
  subtitle: string;
  value?: string;
};

type AuxPanelState = {
  heroTitle?: string;
  heroRoute?: string;
  heroNetPct?: string;
  heroGapPct?: string;
  statusMetrics: Array<{ label: string; value: string; tone?: string }>;
  fundingTop: AuxActionItem[];
  actionFeed: AuxActionItem[];
};

const DEFAULT_STATE: AuxPanelState = {
  statusMetrics: [],
  fundingTop: [],
  actionFeed: [],
};

const AuxPanelContext = createContext<{
  state: AuxPanelState;
  setState: (next: AuxPanelState) => void;
} | null>(null);

export function AuxPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuxPanelState>(DEFAULT_STATE);
  const value = useMemo(() => ({ state, setState }), [state]);
  return <AuxPanelContext.Provider value={value}>{children}</AuxPanelContext.Provider>;
}

export function useAuxPanelState() {
  const context = useContext(AuxPanelContext);
  if (!context) {
    throw new Error("useAuxPanelState must be used within AuxPanelProvider");
  }
  return context;
}

export type { AuxActionItem, AuxPanelState };
