import type { TriangularOpportunity } from "./types";

export interface Book {
  symbol: string;
  base: string;
  quote: string;
  bid: number;
  ask: number;
}

export type BookIndex = Map<string, Book>; // key `${base}/${quote}`

export function indexBooks(books: Book[]): BookIndex {
  const m: BookIndex = new Map();
  for (const b of books) if (b.bid > 0 && b.ask > 0 && b.ask >= b.bid) m.set(`${b.base}/${b.quote}`, b);
  return m;
}

/** Units of `to` received per unit of `from` when crossing the spread (taker). */
export function convert(idx: BookIndex, from: string, to: string): { rate: number; symbol: string } | null {
  const direct = idx.get(`${from}/${to}`);
  if (direct) return { rate: direct.bid, symbol: direct.symbol }; // sell base `from` for quote `to`
  const inverse = idx.get(`${to}/${from}`);
  if (inverse) return { rate: 1 / inverse.ask, symbol: inverse.symbol }; // buy base `to` paying `from`
  return null;
}

/** Enumerate start → A → B → start cycles and rank them by net return after taker fees. */
export function triangular(idx: BookIndex, start: string, assets: string[], feePct: number, top = 12): TriangularOpportunity[] {
  const fee = 1 - feePct / 100;
  const out: TriangularOpportunity[] = [];
  for (const a of assets) {
    if (a === start) continue;
    const l1 = convert(idx, start, a);
    if (!l1) continue;
    for (const b of assets) {
      if (b === start || b === a) continue;
      const l2 = convert(idx, a, b);
      const l3 = l2 && convert(idx, b, start);
      if (!l2 || !l3) continue;
      const gross = l1.rate * l2.rate * l3.rate;
      if (!isFinite(gross) || gross <= 0) continue;
      out.push({
        path: [start, a, b, start],
        symbols: [l1.symbol, l2.symbol, l3.symbol],
        grossPct: (gross - 1) * 100,
        netPct: (gross * fee * fee * fee - 1) * 100,
      });
    }
  }
  return out.sort((x, y) => y.netPct - x.netPct).slice(0, top);
}
