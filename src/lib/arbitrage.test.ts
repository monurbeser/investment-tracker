import { describe, expect, it } from "vitest";
import { convert, indexBooks, triangular } from "./arbitrage";
import { mergeLive } from "./live";

describe("triangular arbitrage", () => {
  const idx = indexBooks([
    { symbol: "BTCUSDT", base: "BTC", quote: "USDT", bid: 100, ask: 100 },
    { symbol: "ETHBTC", base: "ETH", quote: "BTC", bid: 0.1, ask: 0.1 },
    { symbol: "ETHUSDT", base: "ETH", quote: "USDT", bid: 11, ask: 11 },
  ]);
  it("converts in both directions across the spread", () => {
    expect(convert(idx, "USDT", "BTC")!.rate).toBeCloseTo(0.01);
    expect(convert(idx, "BTC", "USDT")!.rate).toBe(100);
  });
  it("finds the profitable cycle and applies fees", () => {
    const [best] = triangular(idx, "USDT", ["BTC", "ETH"], 0.1);
    expect(best.path).toEqual(["USDT", "BTC", "ETH", "USDT"]);
    expect(best.grossPct).toBeCloseTo(10);
    expect(best.netPct).toBeCloseTo((1.1 * 0.999 ** 3 - 1) * 100);
  });
});

describe("mergeLive", () => {
  const bars = [
    { time: 0, close: 10, high: 11, low: 9 },
    { time: 86400, close: 12, high: 12, low: 10 },
  ];
  const q = (price: number, t: number) => ({ id: "x", price, priceUsd: price, prevClose: null, change: null, changePct: null, currency: "USD", asOf: new Date(t * 1000).toISOString(), fetchedAt: "", source: "" });
  it("updates the current day", () => {
    const out = mergeLive(bars, q(13, 86400 + 3600), "daily", false);
    expect(out).toHaveLength(2);
    expect(out[1].close).toBe(13);
    expect(out[1].high).toBe(13);
  });
  it("appends a new day", () => {
    const out = mergeLive(bars, q(14, 2 * 86400 + 60), "daily", false);
    expect(out).toHaveLength(3);
    expect(out[2].time).toBe(2 * 86400);
  });
  it("ignores stale quotes", () => {
    expect(mergeLive(bars, q(1, 100), "daily", false)).toBe(bars);
  });
});
