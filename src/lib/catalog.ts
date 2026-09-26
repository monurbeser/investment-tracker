import type { BondSpec, Category, Instrument, Source } from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  uae: "UAE Borsası (DFM)",
  us: "NASDAQ / NYSE",
  etf: "ETF & Yatırım Fonları",
  bond: "UAE Devlet Tahvilleri",
  crypto: "Kripto (Binance)",
};

export const CATEGORY_SHORT: Record<Category, string> = {
  uae: "UAE",
  us: "US",
  etf: "ETF",
  bond: "Tahvil",
  crypto: "Kripto",
};

export function makeId(source: Source, symbol: string): string {
  return `${source}:${symbol}`;
}

export function parseId(id: string): { source: Source; symbol: string } | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  const source = id.slice(0, i) as Source;
  const symbol = id.slice(i + 1);
  if (!symbol || !["yahoo", "binance", "bond"].includes(source)) return null;
  return { source, symbol };
}

const y = (symbol: string, name: string, category: Category, currency: string, exchange?: string): Instrument => ({
  id: makeId("yahoo", symbol),
  source: "yahoo",
  symbol,
  name,
  category,
  currency,
  exchange,
});

const c = (base: string, name: string): Instrument => ({
  id: makeId("binance", `${base}USDT`),
  source: "binance",
  symbol: `${base}USDT`,
  name,
  category: "crypto",
  currency: "USDT",
  exchange: "Binance",
});

const b = (symbol: string, name: string, bond: BondSpec): Instrument => ({
  id: makeId("bond", symbol),
  source: "bond",
  symbol,
  name,
  category: "bond",
  currency: "USD",
  exchange: "Model",
  bond,
});

/**
 * Starting universe. Anything else can be added from the search box
 * (Yahoo Finance symbol search + Binance USDT pairs).
 * Yahoo lists DFM stocks with the `.AE` suffix; ADX (Abu Dhabi) listings are not
 * carried by Yahoo, and no free ADX feed exists, so they are not included.
 */
export const CATALOG: Instrument[] = [
  // --- UAE equities (AED) ---
  y("EMAAR.AE", "Emaar Properties", "uae", "AED", "DFM"),
  y("EMIRATESNBD.AE", "Emirates NBD", "uae", "AED", "DFM"),
  y("DIB.AE", "Dubai Islamic Bank", "uae", "AED", "DFM"),
  y("DEWA.AE", "Dubai Electricity & Water", "uae", "AED", "DFM"),
  y("SALIK.AE", "Salik", "uae", "AED", "DFM"),
  y("DU.AE", "du (Emirates Integrated Telecom)", "uae", "AED", "DFM"),
  y("AIRARABIA.AE", "Air Arabia", "uae", "AED", "DFM"),
  y("PARKIN.AE", "Parkin", "uae", "AED", "DFM"),
  y("TALABAT.AE", "Talabat", "uae", "AED", "DFM"),
  y("DFM.AE", "Dubai Financial Market", "uae", "AED", "DFM"),
  y("TECOM.AE", "TECOM Group", "uae", "AED", "DFM"),
  y("EMPOWER.AE", "Empower (Emirates Central Cooling)", "uae", "AED", "DFM"),
  y("ALANSARI.AE", "Al Ansari Financial Services", "uae", "AED", "DFM"),

  // --- US equities & indices (USD) ---
  y("^GSPC", "S&P 500 Endeksi", "us", "USD", "INDEX"),
  y("^IXIC", "NASDAQ Composite", "us", "USD", "INDEX"),
  y("^DJI", "Dow Jones Industrial", "us", "USD", "INDEX"),
  y("AAPL", "Apple", "us", "USD", "NASDAQ"),
  y("MSFT", "Microsoft", "us", "USD", "NASDAQ"),
  y("NVDA", "NVIDIA", "us", "USD", "NASDAQ"),
  y("AMZN", "Amazon", "us", "USD", "NASDAQ"),
  y("GOOGL", "Alphabet A", "us", "USD", "NASDAQ"),
  y("META", "Meta Platforms", "us", "USD", "NASDAQ"),
  y("TSLA", "Tesla", "us", "USD", "NASDAQ"),
  y("AVGO", "Broadcom", "us", "USD", "NASDAQ"),
  y("NFLX", "Netflix", "us", "USD", "NASDAQ"),
  y("BRK-B", "Berkshire Hathaway B", "us", "USD", "NYSE"),
  y("JPM", "JPMorgan Chase", "us", "USD", "NYSE"),
  y("V", "Visa", "us", "USD", "NYSE"),
  y("KO", "Coca-Cola", "us", "USD", "NYSE"),
  y("XOM", "Exxon Mobil", "us", "USD", "NYSE"),

  // --- ETFs / funds typically offered via UAE banks & brokers ---
  y("UAE", "iShares MSCI UAE ETF", "etf", "USD", "NASDAQ"),
  y("VWRA.L", "Vanguard FTSE All-World (Acc, USD)", "etf", "USD", "LSE"),
  y("CSPX.L", "iShares Core S&P 500 UCITS (Acc, USD)", "etf", "USD", "LSE"),
  y("IWDA.AS", "iShares Core MSCI World UCITS (Acc)", "etf", "EUR", "AMS"),
  y("EIMI.L", "iShares Core MSCI EM IMI UCITS", "etf", "USD", "LSE"),
  y("SPY", "SPDR S&P 500 ETF", "etf", "USD", "NYSE"),
  y("VOO", "Vanguard S&P 500 ETF", "etf", "USD", "NYSE"),
  y("QQQ", "Invesco QQQ (Nasdaq-100)", "etf", "USD", "NASDAQ"),
  y("SPUS", "SP Funds S&P 500 Sharia ETF", "etf", "USD", "NYSE"),
  y("HLAL", "Wahed FTSE USA Shariah ETF", "etf", "USD", "NASDAQ"),
  y("SPSK", "SP Funds Global Sukuk ETF", "etf", "USD", "NYSE"),
  y("EMB", "iShares JPM USD EM Bond ETF", "etf", "USD", "NASDAQ"),
  y("GLD", "SPDR Gold Shares", "etf", "USD", "NYSE"),
  y("TLT", "iShares 20+ Year Treasury", "etf", "USD", "NASDAQ"),

  // --- UAE sovereign bonds (constant-maturity total-return model) ---
  b("UAE_FED_5Y", "BAE Federal Tahvil 5Y (USD, model)", { issuer: "UAE_FED", tenorYears: 5, benchmark: "^FVX" }),
  b("UAE_FED_10Y", "BAE Federal Tahvil 10Y (USD, model)", { issuer: "UAE_FED", tenorYears: 10, benchmark: "^TNX" }),
  b("UAE_FED_30Y", "BAE Federal Tahvil 30Y (USD, model)", { issuer: "UAE_FED", tenorYears: 30, benchmark: "^TYX" }),
  b("ABU_DHABI_10Y", "Abu Dhabi Hükümeti 10Y (USD, model)", { issuer: "ABU_DHABI", tenorYears: 10, benchmark: "^TNX" }),
  b("DUBAI_10Y", "Dubai Hükümeti Sukuk/Tahvil 10Y (USD, model)", { issuer: "DUBAI", tenorYears: 10, benchmark: "^TNX" }),
  b("DUBAI_30Y", "Dubai Hükümeti Tahvil 30Y (USD, model)", { issuer: "DUBAI", tenorYears: 30, benchmark: "^TYX" }),

  // --- Crypto (Binance spot, USDT) ---
  c("BTC", "Bitcoin"),
  c("ETH", "Ethereum"),
  c("BNB", "BNB"),
  c("SOL", "Solana"),
  c("XRP", "XRP"),
  c("ADA", "Cardano"),
  c("DOGE", "Dogecoin"),
  c("AVAX", "Avalanche"),
  c("TRX", "TRON"),
  c("LINK", "Chainlink"),
  c("DOT", "Polkadot"),
  c("TON", "Toncoin"),
];

const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export function findInstrument(id: string): Instrument | undefined {
  return BY_ID.get(id);
}

/** Resolve any id, including ones added from search that are not in the catalog. */
export function resolveInstrument(id: string, hint?: Partial<Instrument>): Instrument | null {
  const known = BY_ID.get(id);
  if (known) return known;
  const parsed = parseId(id);
  if (!parsed || parsed.source === "bond") return null;
  if (parsed.source === "binance") {
    const quote = parsed.symbol.endsWith("USDT") ? "USDT" : parsed.symbol.slice(-4);
    return {
      id,
      source: "binance",
      symbol: parsed.symbol,
      name: hint?.name ?? parsed.symbol.replace(/USDT$/, ""),
      category: "crypto",
      currency: quote,
      exchange: "Binance",
    };
  }
  return {
    id,
    source: "yahoo",
    symbol: parsed.symbol,
    name: hint?.name ?? parsed.symbol,
    category: hint?.category ?? (parsed.symbol.endsWith(".AE") ? "uae" : "us"),
    currency: hint?.currency ?? (parsed.symbol.endsWith(".AE") ? "AED" : "USD"),
    exchange: hint?.exchange,
  };
}

export const DEFAULT_SELECTION = ["binance:BTCUSDT", "yahoo:^GSPC", "yahoo:EMAAR.AE", "yahoo:VWRA.L", "bond:UAE_FED_10Y"];

/** Default top-ticker symbols. */
export const TICKER_TOP = [
  "yahoo:^GSPC",
  "yahoo:^IXIC",
  "yahoo:^DJI",
  "binance:BTCUSDT",
  "binance:ETHUSDT",
  "binance:SOLUSDT",
  "yahoo:EMAAR.AE",
  "yahoo:EMIRATESNBD.AE",
  "yahoo:DIB.AE",
  "yahoo:SALIK.AE",
  "yahoo:DEWA.AE",
  "yahoo:NVDA",
  "yahoo:AAPL",
  "yahoo:MSFT",
  "yahoo:UAE",
  "yahoo:GLD",
];
