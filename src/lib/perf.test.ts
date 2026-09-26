import { describe, expect, it } from "vitest";
import { baseIndex, combineEquity, parBondRisk, periodReturn, periodStart, simulate, yieldToTotalReturnIndex } from "./perf";
import type { Bar } from "./types";

const DAY = 86400;
const d = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000;
const daily = (from: string, closes: number[]): Bar[] => closes.map((c, i) => ({ time: d(from) + i * DAY, close: c }));

describe("periodStart", () => {
  const now = d("2026-09-26");
  it("handles calendar months and YTD", () => {
    expect(periodStart("1W", now)).toBe(d("2026-09-19"));
    expect(periodStart("1M", now)).toBe(d("2026-08-26"));
    expect(periodStart("1Y", now)).toBe(d("2025-09-26"));
    expect(periodStart("5Y", now)).toBe(d("2021-09-26"));
    expect(periodStart("YTD", now)).toBe(d("2026-01-01") - 1);
  });
  it("clamps month ends", () => {
    expect(periodStart("1M", d("2026-03-31"))).toBe(d("2026-02-28"));
  });
});

describe("baseIndex / periodReturn", () => {
  const bars = daily("2026-01-01", [100, 110, 121, 133.1]);
  it("uses the last bar at or before the window start", () => {
    expect(baseIndex(bars, d("2026-01-02") + 3600)).toBe(1);
  });
  it("returns -1 if history is too short", () => {
    expect(baseIndex(bars, d("2025-06-01"))).toBe(-1);
  });
  it("computes returns", () => {
    const r = periodReturn(bars, "1W", d("2026-01-04"));
    expect(r?.pct).toBeCloseTo(33.1, 6);
  });
  it("YTD uses previous year close", () => {
    const b = [...daily("2025-12-30", [50, 100]), ...daily("2026-01-02", [120])];
    expect(periodReturn(b, "YTD", d("2026-01-03"))?.pct).toBeCloseTo(20, 6);
  });
});

describe("simulate", () => {
  it("buys at first close on/after date and marks to last", () => {
    const bars = daily("2026-01-01", [10, 20, 5, 15]);
    const r = simulate(bars, 1000, d("2026-01-01") + 3600)!;
    expect(r.buyPrice).toBe(20);
    expect(r.units).toBe(50);
    expect(r.value).toBe(750);
    expect(r.pnlPct).toBeCloseTo(-25);
    expect(r.maxDrawdownPct).toBeCloseTo(-75);
    expect(r.cagrPct).toBeNull();
  });
  it("uses adjusted closes when asked", () => {
    const bars: Bar[] = [
      { time: d("2026-01-01"), close: 10, adj: 9 },
      { time: d("2026-01-02"), close: 10, adj: 10 },
    ];
    expect(simulate(bars, 90, d("2026-01-01"), true)!.value).toBeCloseTo(100);
    expect(simulate(bars, 90, d("2026-01-01"), false)!.value).toBeCloseTo(90);
  });
  it("annualises over a year", () => {
    const bars: Bar[] = [
      { time: d("2024-01-01"), close: 100 },
      { time: d("2026-01-01"), close: 121 },
    ];
    expect(simulate(bars, 100, d("2024-01-01"))!.cagrPct).toBeCloseTo(10, 1);
  });
});

describe("combineEquity", () => {
  it("forward-fills across different calendars", () => {
    const a = [
      { time: 1, value: 10 },
      { time: 3, value: 30 },
    ];
    const b = [
      { time: 1, value: 1 },
      { time: 2, value: 2 },
    ];
    expect(combineEquity([a, b])).toEqual([
      { time: 1, value: 11 },
      { time: 2, value: 12 },
      { time: 3, value: 32 },
    ]);
  });
});

describe("bond model", () => {
  it("par bond duration is sensible", () => {
    const { duration } = parBondRisk(0.045, 10);
    expect(duration).toBeGreaterThan(7.8);
    expect(duration).toBeLessThan(8.2);
  });
  it("earns carry with flat yields and loses on a rate rise", () => {
    const flat = yieldToTotalReturnIndex(
      Array.from({ length: 366 }, (_, i) => ({ time: i * DAY, y: 0.05 })),
      10,
    );
    expect(flat.at(-1)!.close).toBeGreaterThan(104.9);
    expect(flat.at(-1)!.close).toBeLessThan(105.2);
    const shock = yieldToTotalReturnIndex(
      [
        { time: 0, y: 0.05 },
        { time: DAY, y: 0.06 },
      ],
      10,
    );
    expect(shock[1].close).toBeLessThan(93);
    expect(shock[1].close).toBeGreaterThan(92);
  });
});
