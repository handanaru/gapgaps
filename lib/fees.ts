export const FEES = {
  binanceTakerPct: 0.05,
  bithumbTakerPct: 0.04,
  okxTakerPct: 0.08,
  fxSlippagePct: 0.02
} as const;

export const ROUND_TRIP_BINANCE_FEE_PCT = FEES.binanceTakerPct * 2;
export const BITHUMB_OKX_EFFECTIVE_FEE_PCT =
  FEES.bithumbTakerPct + FEES.okxTakerPct + FEES.fxSlippagePct;
