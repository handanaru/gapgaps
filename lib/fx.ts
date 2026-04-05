export const FX_CONFIG = {
  fallbackUsdKrw: 1350,
  minUsdKrw: 900,
  maxUsdKrw: 2000
} as const;

export function sanitizeUsdKrw(raw: number | null | undefined): number {
  if (!raw || !Number.isFinite(raw)) return FX_CONFIG.fallbackUsdKrw;
  if (raw < FX_CONFIG.minUsdKrw || raw > FX_CONFIG.maxUsdKrw) {
    return FX_CONFIG.fallbackUsdKrw;
  }
  return raw;
}

export function convertUsdtToKrw(usdtPrice: number, usdKrw: number): number {
  return usdtPrice * usdKrw;
}
