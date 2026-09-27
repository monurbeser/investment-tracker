import { describe, expect, it } from "vitest";
import * as I from "./indicators";
import { analyze, rankSignals, recOf, toRow } from "./engine";
import type { OhlcvBar } from "./types";

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

/** Geometric random walk with drift; volume reacts to move size. */
function walk(n: number, drift: number, vol: number, seed = 7, start = 100): OhlcvBar[] {
  const r = rng(seed);
  const out: OhlcvBar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const g = (r() + r() + r() - 1.5) * 2;
    const o = p;
    p = p * Math.exp(drift + vol * g);
    const hi = Math.max(o, p) * (1 + vol * 0.4 * r());
    const lo = Math.min(o, p) * (1 - vol * 0.4 * r());
    out.push({ time: 1_600_000_000 + i * 86400, open: o, high: hi, low: lo, close: p, volume: 1e6 * (1 + Math.abs(g)) });
  }
  return out;
}

describe("indicators", () => {
  it("sma / ema basics", () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(I.sma(x, 3).slice(2)).toEqual([2, 3, 4, 5]);
    const e = I.ema(x, 3);
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3, 10);
    expect(Number.isNaN(e[1])).toBe(true);
  });

  it("sma skips leading NaN (e.g. smoothing another indicator)", () => {
    const x = [NaN, NaN, 1, 2, 3, 4];
    expect(I.sma(x, 2).slice(3)).toEqual([1.5, 2.5, 3.5]);
    expect(Number.isNaN(I.sma(x, 2)[2])).toBe(true);
  });

  it("stochastic %D is defined after warm-up", () => {
    const b = walk(60, 0.001, 0.01);
    const s = I.stochastic(b.map((x) => x.high), b.map((x) => x.low), b.map((x) => x.close));
    expect(Number.isFinite(s.d.at(-1)!)).toBe(true);
  });

  it("RSI is 100 on a monotonic rise and 0 on a monotonic fall", () => {
    const up = Array.from({ length: 40 }, (_, i) => 10 + i);
    const dn = Array.from({ length: 40 }, (_, i) => 60 - i);
    expect(I.rsi(up).at(-1)).toBe(100);
    expect(I.rsi(dn).at(-1)).toBe(0);
  });

  it("RSI matches Wilder's reference example", () => {
    // Classic 14-period example from Wilder / StockCharts (first RSI ≈ 70.5; StockCharts rounds intermediates to 70.53).
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(I.rsi(c, 14)[14]).toBeCloseTo(70.5, 0);
  });

  it("supertrend follows the trend direction", () => {
    const up = walk(200, 0.004, 0.005);
    const dn = walk(200, -0.004, 0.005);
    const su = I.supertrend(up.map((b) => b.high), up.map((b) => b.low), up.map((b) => b.close));
    const sd = I.supertrend(dn.map((b) => b.high), dn.map((b) => b.low), dn.map((b) => b.close));
    expect(su.dir.at(-1)).toBe(1);
    expect(sd.dir.at(-1)).toBe(-1);
    expect(su.line.at(-1)!).toBeLessThan(up.at(-1)!.close);
  });

  it("ADX is high in a steady trend and +DI dominates", () => {
    const b = walk(150, 0.006, 0.004);
    const a = I.adx(b.map((x) => x.high), b.map((x) => x.low), b.map((x) => x.close));
    expect(a.adx.at(-1)!).toBeGreaterThan(25);
    expect(a.pdi.at(-1)!).toBeGreaterThan(a.mdi.at(-1)!);
  });

  it("linreg recovers a known slope", () => {
    const y = Array.from({ length: 30 }, (_, i) => 3 + 0.5 * i);
    const r = I.linreg(y, 29, 30)!;
    expect(r.slope).toBeCloseTo(0.5, 10);
    expect(r.r2).toBeCloseTo(1, 10);
  });
});

describe("engine", () => {
  it("needs enough history", () => {
    expect(analyze(walk(100, 0, 0.01))).toBeNull();
  });

  it("scores a strong up-trend as buy and a down-trend as sell", () => {
    const up = analyze(walk(600, 0.003, 0.008, 11))!;
    const dn = analyze(walk(600, -0.003, 0.008, 11))!;
    expect(up.score).toBeGreaterThan(15);
    expect(["buy", "strong_buy"]).toContain(up.rec);
    expect(dn.score).toBeLessThan(-15);
    expect(["sell", "strong_sell"]).toContain(dn.rec);
    expect(up.groups.trend).toBeGreaterThan(50);
    expect(dn.groups.trend).toBeLessThan(-50);
  });

  it("orders price levels consistently with the signal direction", () => {
    const up = analyze(walk(600, 0.003, 0.008, 3))!;
    expect(up.levels.stop).toBeLessThan(up.price);
    expect(up.levels.t1).toBeGreaterThan(up.price);
    expect(up.levels.t2).toBeGreaterThanOrEqual(up.levels.t1);
    expect(up.levels.t3).toBeGreaterThanOrEqual(up.levels.t2);
    expect(up.levels.expectedPct).toBeGreaterThan(0);

    const dn = analyze(walk(600, -0.003, 0.008, 3))!;
    expect(dn.levels.stop).toBeGreaterThan(dn.price);
    expect(dn.levels.t1).toBeLessThan(dn.price);
    expect(dn.levels.t2).toBeLessThanOrEqual(dn.levels.t1);
    expect(dn.levels.t3).toBeLessThanOrEqual(dn.levels.t2);
    expect(dn.levels.expectedPct).toBeLessThan(0);
  });

  it("produces volume / trend tables and bounded strength", () => {
    const a = analyze(walk(1300, 0.0005, 0.012, 5))!;
    expect(a.volume.map((v) => v.key)).toEqual(["1D", "1W", "1M", "YTD", "1Y", "5Y"]);
    expect(a.volume.find((v) => v.key === "5Y")!.bars).toBe(1260);
    expect(a.trend).toHaveLength(3);
    expect(a.strength).toBeGreaterThanOrEqual(0);
    expect(a.strength).toBeLessThanOrEqual(100);
    expect(a.readings.map((r) => r.key)).toEqual(expect.arrayContaining(["ema", "cross", "macd", "adx", "supertrend", "ichimoku", "rsi", "stoch", "cci", "roc", "obv", "cmf", "mfi", "rvol", "vwap", "bb", "donchian", "52w"]));
    for (const r of a.readings) expect(Math.abs(r.signal)).toBeLessThanOrEqual(1);
    expect(a.calibration.samples).toBeGreaterThan(0);
  });

  it("does not look ahead: appending future bars leaves past scores unchanged", () => {
    const bars = walk(500, 0.001, 0.01, 9);
    const a = analyze(bars.slice(0, 400))!;
    const b = analyze(bars)!;
    const same = b.scoreHistory.find((p) => p.time === a.asOf)!;
    expect(same.value).toBeCloseTo(a.score, 1);
  });

  it("maps scores to recommendations", () => {
    expect(recOf(60)).toBe("strong_buy");
    expect(recOf(20)).toBe("buy");
    expect(recOf(0)).toBe("hold");
    expect(recOf(-20)).toBe("sell");
    expect(recOf(-60)).toBe("strong_sell");
  });

  it("ranks only liquid names and splits buys / sells", () => {
    const bars = walk(600, 0.003, 0.008, 2, 50);
    const a = analyze(bars)!;
    const row = toRow({ symbol: "X", name: "X", exchange: "NASDAQ" }, bars, a);
    const illiquid = { ...row, symbol: "Y", avgDollarVolume: 1000 };
    const sell = { ...row, symbol: "Z", rec: "sell" as const, score: -40 };
    const { buys, sells } = rankSignals([row, illiquid, sell]);
    expect(buys.map((r) => r.symbol)).toEqual(["X"]);
    expect(sells.map((r) => r.symbol)).toEqual(["Z"]);
  });
});
