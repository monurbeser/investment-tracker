import type { OhlcvBar, StockDetail } from "./types";

/**
 * Static-hosting layout of the signal platform (GitHub Pages):
 *   data/signals/scan.json
 *   data/signals/detail/<SYMBOL>.json   (columnar OHLCV + info)
 */
export const SCAN_PATH = "data/signals/scan.json";
export const detailPath = (symbol: string) => `data/signals/detail/${symbol.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

export type StoredDetail = Omit<StockDetail, "bars"> & {
  /** Columns: day number (time / 86400), open, high, low, close, volume. */
  cols: { d: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
};

const p = (x: number) => +x.toPrecision(6);

export function packDetail(d: StockDetail): StoredDetail {
  const { bars, ...rest } = d;
  return {
    ...rest,
    cols: {
      d: bars.map((b) => Math.round(b.time / 86400)),
      o: bars.map((b) => p(b.open)),
      h: bars.map((b) => p(b.high)),
      l: bars.map((b) => p(b.low)),
      c: bars.map((b) => p(b.close)),
      v: bars.map((b) => Math.round(b.volume)),
    },
  };
}

export function unpackDetail(s: StoredDetail): StockDetail {
  const { cols, ...rest } = s;
  const bars: OhlcvBar[] = cols.d.map((d, i) => ({ time: d * 86400, open: cols.o[i], high: cols.h[i], low: cols.l[i], close: cols.c[i], volume: cols.v[i] }));
  return { ...rest, bars };
}
