import type { Bar, Period } from "./types";

export const PERIODS: Period[] = ["1W", "1M", "3M", "6M", "1Y", "YTD", "5Y"];

export const PERIOD_LABELS: Record<Period, string> = {
  "1W": "1 Hafta",
  "1M": "1 Ay",
  "3M": "3 Ay",
  "6M": "6 Ay",
  "1Y": "1 Yıl",
  YTD: "YTD",
  "5Y": "5 Yıl",
};

const DAY = 86400;

/** Start of the look-back window (unix seconds, UTC). */
export function periodStart(period: Period, nowSec: number): number {
  const d = new Date(nowSec * 1000);
  switch (period) {
    case "1W":
      return nowSec - 7 * DAY;
    case "1M":
      return shiftMonths(d, -1);
    case "3M":
      return shiftMonths(d, -3);
    case "6M":
      return shiftMonths(d, -6);
    case "1Y":
      return shiftMonths(d, -12);
    case "5Y":
      return shiftMonths(d, -60);
    case "YTD":
      // Base is the last close of the previous year, i.e. anything on/before Dec 31.
      return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000 - 1;
  }
}

function shiftMonths(d: Date, months: number): number {
  const t = new Date(d.getTime());
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + months);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return Math.floor(t.getTime() / 1000);
}

/**
 * Index of the base bar for a window starting at `start`: the last bar at or
 * before `start`. Returns -1 when the history does not reach back far enough
 * (a small tolerance lets e.g. a Monday listing count for a Saturday start).
 */
export function baseIndex(bars: Bar[], start: number, toleranceSec = 5 * DAY): number {
  if (!bars.length) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= start) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans >= 0) return ans;
  return bars[0].time - start <= toleranceSec ? 0 : -1;
}

export interface PeriodReturn {
  pct: number;
  start: number;
  end: number;
  startTime: number;
}

export function periodReturn(bars: Bar[], period: Period, nowSec: number, useAdj = false): PeriodReturn | null {
  if (bars.length < 2) return null;
  const i = baseIndex(bars, periodStart(period, nowSec));
  if (i < 0 || i >= bars.length - 1) return null;
  const px = (b: Bar) => (useAdj && b.adj != null ? b.adj : b.close);
  const start = px(bars[i]);
  const end = px(bars[bars.length - 1]);
  if (!(start > 0)) return null;
  return { pct: (end / start - 1) * 100, start, end, startTime: bars[i].time };
}

/** Percentage-change series relative to the base bar of the window. */
export function normalizedSeries(bars: Bar[], start: number): { time: number; value: number }[] {
  const i = baseIndex(bars, start);
  if (i < 0) return [];
  const base = bars[i].close;
  if (!(base > 0)) return [];
  return bars.slice(i).map((b) => ({ time: b.time, value: (b.close / base - 1) * 100 }));
}

export function sliceFrom(bars: Bar[], start: number): Bar[] {
  const i = baseIndex(bars, start);
  if (i < 0) return bars.filter((b) => b.time >= start);
  return bars.slice(i);
}

export interface SimulationResult {
  invested: number;
  buyTime: number;
  buyPrice: number;
  units: number;
  lastTime: number;
  lastPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  /** Annualised return; null for holding periods under 30 days. */
  cagrPct: number | null;
  maxDrawdownPct: number;
  equity: { time: number; value: number }[];
}

/**
 * "If I had put `amount` USD in on `date`": buys at the close of the first bar
 * on/after `date` and marks to the latest bar. `bars` must be in USD.
 */
export function simulate(bars: Bar[], amount: number, dateSec: number, useAdj = false): SimulationResult | null {
  if (!(amount > 0) || !bars.length) return null;
  const px = (b: Bar) => (useAdj && b.adj != null ? b.adj : b.close);
  const i = bars.findIndex((b) => b.time >= dateSec);
  if (i < 0 || i >= bars.length) return null;
  const buyPrice = px(bars[i]);
  if (!(buyPrice > 0)) return null;
  const units = amount / buyPrice;
  let peak = -Infinity;
  let mdd = 0;
  const equity = bars.slice(i).map((b) => {
    const value = units * px(b);
    peak = Math.max(peak, value);
    mdd = Math.min(mdd, value / peak - 1);
    return { time: b.time, value };
  });
  const last = bars[bars.length - 1];
  const lastPrice = px(last);
  const value = units * lastPrice;
  const years = (last.time - bars[i].time) / (365.25 * DAY);
  const cagrPct = years >= 30 / 365.25 ? (Math.pow(value / amount, 1 / years) - 1) * 100 : null;
  return {
    invested: amount,
    buyTime: bars[i].time,
    buyPrice,
    units,
    lastTime: last.time,
    lastPrice,
    value,
    pnl: value - amount,
    pnlPct: (value / amount - 1) * 100,
    cagrPct,
    maxDrawdownPct: mdd * 100,
    equity,
  };
}

/** Sum of several equity curves on the union of their timestamps (forward-filled). */
export function combineEquity(curves: { time: number; value: number }[][]): { time: number; value: number }[] {
  const times = Array.from(new Set(curves.flatMap((c) => c.map((p) => p.time)))).sort((a, b) => a - b);
  const idx = curves.map(() => 0);
  const lastVal = curves.map((c) => (c.length ? c[0].value : 0));
  return times.map((t) => {
    let sum = 0;
    curves.forEach((c, k) => {
      while (idx[k] < c.length && c[idx[k]].time <= t) {
        lastVal[k] = c[idx[k]].value;
        idx[k]++;
      }
      sum += lastVal[k];
    });
    return { time: t, value: sum };
  });
}

/**
 * Constant-maturity total-return index driven by a yield series (decimal yields).
 * Daily return ≈ carry (y·Δt) − modified duration·Δy + ½·convexity·Δy².
 */
export function yieldToTotalReturnIndex(
  yields: { time: number; y: number }[],
  tenorYears: number,
  startValue = 100,
): Bar[] {
  if (!yields.length) return [];
  const out: Bar[] = [{ time: yields[0].time, close: startValue }];
  let v = startValue;
  for (let k = 1; k < yields.length; k++) {
    const prev = yields[k - 1];
    const cur = yields[k];
    const dt = (cur.time - prev.time) / (365.25 * DAY);
    const dy = cur.y - prev.y;
    const { duration, convexity } = parBondRisk(prev.y, tenorYears);
    const r = prev.y * dt - duration * dy + 0.5 * convexity * dy * dy;
    v *= 1 + r;
    out.push({ time: cur.time, close: v });
  }
  return out;
}

/** Modified duration and convexity of a semi-annual par bond. */
export function parBondRisk(y: number, tenorYears: number): { duration: number; convexity: number } {
  const n = Math.max(1, Math.round(tenorYears * 2));
  const c = y / 2; // par coupon per period
  const r = y / 2;
  let pv = 0;
  let dur = 0;
  let conv = 0;
  for (let t = 1; t <= n; t++) {
    const cf = t === n ? c + 1 : c;
    const df = Math.pow(1 + r, -t);
    pv += cf * df;
    dur += t * cf * df;
    conv += t * (t + 1) * cf * df;
  }
  if (!(pv > 0)) return { duration: tenorYears, convexity: tenorYears * tenorYears };
  const macaulayPeriods = dur / pv;
  const duration = macaulayPeriods / 2 / (1 + r);
  const convexity = conv / pv / Math.pow(1 + r, 2) / 4;
  return { duration, convexity };
}
