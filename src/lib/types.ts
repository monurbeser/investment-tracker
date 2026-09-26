export type Category = "uae" | "us" | "etf" | "bond" | "crypto";
export type Source = "yahoo" | "binance" | "bond";
export type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "5Y";
export type Resolution = "daily" | "intraday";

export type BondIssuer = "UAE_FED" | "ABU_DHABI" | "DUBAI";

export interface BondSpec {
  issuer: BondIssuer;
  /** Constant maturity in years (5, 10, 30). */
  tenorYears: number;
  /** Yahoo symbol of the US Treasury benchmark yield (quoted in percent). */
  benchmark: "^FVX" | "^TNX" | "^TYX";
}

export interface Instrument {
  /** `${source}:${symbol}` */
  id: string;
  source: Source;
  symbol: string;
  name: string;
  category: Category;
  /** Trading currency of the quotes (AED, USD, USDT, EUR, GBp ...). Yahoo may correct it at runtime. */
  currency: string;
  exchange?: string;
  bond?: BondSpec;
}

export interface Bar {
  /** Unix seconds (UTC). */
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  /** Dividend/split adjusted close when the source provides it. */
  adj?: number;
}

export interface HistoryResponse {
  id: string;
  currency: string;
  resolution: Resolution;
  /** Bars in the instrument's own currency. */
  bars: Bar[];
  /** Same bars converted to USD (close/adj only). */
  usd: Bar[];
  /** Time of the latest data point that the source returned (ISO). */
  lastDataAt: string | null;
  /** When the server fetched the data from the upstream source (ISO). */
  fetchedAt: string;
  source: string;
  note?: string;
  demo?: boolean;
}

export interface Quote {
  id: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  priceUsd: number | null;
  /** Market time of the price (ISO). */
  asOf: string | null;
  fetchedAt: string;
  source: string;
  demo?: boolean;
}

export interface QuotesResponse {
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  fetchedAt: string;
  demo?: boolean;
}

export interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
  category: Category;
  source: Source;
  currency: string;
}

export interface FxRate {
  pair: string;
  label: string;
  rate: number;
  changePct: number | null;
  asOf: string | null;
}

export interface TriangularOpportunity {
  path: string[];
  symbols: string[];
  grossPct: number;
  netPct: number;
}

export interface PremiumRow {
  fiat: string;
  binanceSymbol: string;
  binanceRate: number;
  officialRate: number;
  premiumPct: number;
}

export interface ArbitrageResponse {
  triangular: TriangularOpportunity[];
  premiums: PremiumRow[];
  peg: { official: number; market: number | null; deviationPct: number | null; asOf: string | null };
  fx: FxRate[];
  feePct: number;
  fetchedAt: string;
  errors: string[];
  demo?: boolean;
}
