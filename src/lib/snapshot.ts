import type { Bar, FxRate, HistoryResponse, Quote, Resolution } from "./types";

/**
 * Static-hosting data layout (GitHub Pages). Written by scripts/snapshot.ts,
 * read by the browser in static mode.
 *   data/quotes.json
 *   data/fx.json
 *   data/history/<res>/<fileId>.json
 */
export const fileId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, "_");
export const historyPath = (id: string, res: Resolution) => `data/history/${res}/${fileId(id)}.json`;

export interface FxSnapshot {
  fx: FxRate[];
  /** USD/<fiat> official rates for the USDT premium table. */
  officials: Record<string, number>;
  fetchedAt: string;
  errors: string[];
}

export interface QuotesSnapshot {
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  fetchedAt: string;
}

/** History as stored on disk: `usd` omitted when it equals `bars`. */
export type StoredHistory = Omit<HistoryResponse, "usd"> & { usd?: Bar[] };

const r6 = (v: number | undefined) => (v == null ? undefined : +v.toPrecision(7));

export function compactBars(bars: Bar[]): Bar[] {
  return bars.map((b) => ({ time: b.time, open: r6(b.open), high: r6(b.high), low: r6(b.low), close: r6(b.close)!, adj: r6(b.adj) }));
}

export function expandHistory(h: StoredHistory): HistoryResponse {
  return { ...h, usd: h.usd ?? h.bars };
}
