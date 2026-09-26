import type { PremiumRow, TriangularOpportunity } from "./types";

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

/** Common quote assets, longest first, for splitting a Binance symbol without exchangeInfo. */
const QUOTES = ["FDUSD", "USDT", "USDC", "TUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "BRL", "ARS", "ZAR", "UAH", "PLN", "RON", "MXN", "COP", "JPY", "IDR", "CZK", "DAI", "XRP", "DOGE", "TRX", "SOL"];

export function splitSymbol(symbol: string): { base: string; quote: string } | null {
  for (const q of QUOTES) if (symbol.length > q.length && symbol.endsWith(q)) return { base: symbol.slice(0, -q.length), quote: q };
  return null;
}

export const TRI_ASSETS = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "TRX", "LINK", "LTC", "DOT", "AVAX", "TON", "USDC", "FDUSD", "EUR", "TRY", "BRL"];
export const PREMIUM_FIATS = ["TRY", "BRL", "ARS", "ZAR", "UAH", "PLN", "RON", "MXN", "COP", "JPY", "IDR", "CZK"];

/**
 * USDT premium vs. the official USD rate for each fiat with a USDT/<fiat> book,
 * plus EUR via EUR/USDT vs EURUSD. `officials` maps fiat -> USD<fiat> rate.
 */
export function premiums(idx: BookIndex, officials: Record<string, number>, eurusd: number | null): PremiumRow[] {
  const rows: PremiumRow[] = [];
  for (const f of PREMIUM_FIATS) {
    const book = idx.get(`USDT/${f}`);
    const official = officials[f];
    if (!book || !official) continue;
    const mid = (book.bid + book.ask) / 2;
    rows.push({ fiat: f, binanceSymbol: book.symbol, binanceRate: mid, officialRate: official, premiumPct: (mid / official - 1) * 100 });
  }
  const eur = idx.get("EUR/USDT");
  if (eur && eurusd) {
    const mid = (eur.bid + eur.ask) / 2;
    rows.push({ fiat: "EUR", binanceSymbol: eur.symbol, binanceRate: mid, officialRate: eurusd, premiumPct: (mid / eurusd - 1) * 100 });
  }
  return rows.sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct));
}
