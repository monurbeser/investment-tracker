import type { Bar } from "../types";
import { yahooHistory } from "./yahoo";
import { baseIndex } from "../perf";

/** The dirham has been pegged to the dollar at 3.6725 since 1997. */
export const AED_PEG = 3.6725;

const PEGGED: Record<string, number> = {
  USD: 1,
  USDT: 1,
  USDC: 1,
  FDUSD: 1,
  AED: 1 / AED_PEG,
  SAR: 1 / 3.75,
  QAR: 1 / 3.64,
  BHD: 1 / 0.376,
  OMR: 1 / 0.3845,
};

/** Convert bars quoted in `currency` into USD using the day's FX close. */
export async function toUsd(bars: Bar[], currency: string): Promise<{ bars: Bar[]; note?: string }> {
  const peg = PEGGED[currency];
  if (peg != null) {
    const note =
      currency === "USDT" || currency === "USDC" || currency === "FDUSD"
        ? `${currency} ≈ 1 USD kabul edildi`
        : currency === "AED"
          ? "AED/USD sabit kur 3.6725 ile çevrildi"
          : undefined;
    return { bars: peg === 1 ? bars.map(({ time, close, adj }) => ({ time, close, adj })) : scale(bars, () => peg), note };
  }
  const fx = (await yahooHistory(`${currency}USD=X`, "daily")).bars;
  if (!fx.length) throw new Error(`${currency}USD kuru bulunamadı`);
  return {
    bars: scale(bars, (t) => {
      const i = baseIndex(fx, t, Infinity);
      return fx[Math.max(0, i)].close;
    }),
    note: `${currency}→USD günlük kapanış kuru ile çevrildi`,
  };
}

function scale(bars: Bar[], rate: (t: number) => number): Bar[] {
  return bars.map((b) => {
    const r = rate(b.time);
    return { time: b.time, close: b.close * r, adj: b.adj != null ? b.adj * r : undefined };
  });
}

export function usdRateNow(currency: string, fxLast?: number): number | null {
  const peg = PEGGED[currency];
  if (peg != null) return peg;
  return fxLast ?? null;
}
