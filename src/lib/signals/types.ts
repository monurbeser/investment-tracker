/** Shared types of the US signal platform (/signals). */

export interface OhlcvBar {
  /** Unix seconds, 00:00 UTC of the trading day. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Rec = "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
export type Group = "trend" | "momentum" | "volume" | "volatility";

export interface IndicatorReading {
  key: string;
  label: string;
  group: Group;
  /** Human readable value, e.g. "RSI 63.2". */
  value: string;
  /** −1 (bearish) … +1 (bullish). */
  signal: number;
  note: string;
}

export interface VolumeRow {
  key: "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y";
  label: string;
  bars: number;
  avgVolume: number | null;
  avgDollarVolume: number | null;
  totalVolume: number | null;
  /** Average volume of the period relative to the 1Y average (1 = same). */
  vs1Y: number | null;
  /** Price return over the period, %. */
  returnPct: number | null;
}

export interface TrendRow {
  key: "short" | "mid" | "long";
  label: string;
  bars: number;
  /** Annualised slope of log price, %. */
  slopePct: number | null;
  r2: number | null;
  /** Price vs the matching moving average, %. */
  vsMaPct: number | null;
  label2: string;
  dir: -2 | -1 | 0 | 1 | 2;
}

export interface Levels {
  price: number;
  atr: number;
  atrPct: number;
  /** Daily volatility (stdev of log returns, 60d), %. */
  volPct: number;
  horizonDays: number;
  /** Projected move over the horizon, % (negative for sell). */
  expectedPct: number;
  targetPrice: number;
  t1: number;
  t2: number;
  t3: number;
  stop: number;
  riskReward: number | null;
  supports: number[];
  resistances: number[];
}

export interface Calibration {
  /** Similar-signal days found in history. */
  samples: number;
  /** Share of those days where price moved in the signal direction over the horizon. */
  hitRate: number | null;
  avgFwdPct: number | null;
  medianFwdPct: number | null;
  /** Unconditional average forward return over the same history, %. */
  baseFwdPct: number | null;
}

export interface SignalEvent {
  time: number;
  kind: "buy" | "sell";
  score: number;
}

export interface Analysis {
  asOf: number;
  price: number;
  changePct: number | null;
  /** −100 … +100. */
  score: number;
  rec: Rec;
  /** 0 … 100, how convincing the signal is (magnitude + indicator agreement + history). */
  strength: number;
  groups: Record<Group, number>;
  /** ADX-based regime weight: 0 = range-bound, 1 = trending. */
  trendiness: number;
  readings: IndicatorReading[];
  levels: Levels;
  calibration: Calibration;
  volume: VolumeRow[];
  rvol: number | null;
  trend: TrendRow[];
  events: SignalEvent[];
  /** Score history (last ~1y) for charting. */
  scoreHistory: { time: number; value: number }[];
}

/** Compact per-stock row of a universe scan. */
export interface SignalRow {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  price: number;
  changePct: number | null;
  score: number;
  rec: Rec;
  strength: number;
  expectedPct: number;
  targetPrice: number;
  t1: number;
  t2: number;
  t3: number;
  stop: number;
  hitRate: number | null;
  rvol: number | null;
  avgDollarVolume: number | null;
  marketCap?: number | null;
  trend: TrendRow["dir"];
  groups: Record<Group, number>;
  /** Last 60 closes for sparklines. */
  spark: number[];
  asOf: number;
}

export interface Breadth {
  total: number;
  above50: number;
  above200: number;
  buys: number;
  sells: number;
  holds: number;
  advancers: number;
  decliners: number;
}

export interface SignalScan {
  generatedAt: string;
  /** Latest market bar found across the universe (ISO). */
  lastDataAt: string | null;
  universe: number;
  scanned: number;
  buys: SignalRow[];
  sells: SignalRow[];
  rows: SignalRow[];
  breadth: Breadth;
  benchmarks: SignalRow[];
  discovered: number;
  errors: string[];
  source: string;
  demo?: boolean;
}

/** Fundamentals / Level-1 quote fields gathered from Yahoo (all optional). */
export interface StockInfo {
  longName?: string;
  shortName?: string;
  exchange?: string;
  fullExchangeName?: string;
  quoteType?: string;
  currency?: string;
  marketState?: string;
  sector?: string;
  industry?: string;
  country?: string;
  city?: string;
  website?: string;
  employees?: number;
  summary?: string;
  marketCap?: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  priceToSales?: number;
  eps?: number;
  epsForward?: number;
  bookValue?: number;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: number;
  beta?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  shortPercentOfFloat?: number;
  shortRatio?: number;
  heldByInsiders?: number;
  heldByInstitutions?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  avgVolume3M?: number;
  avgVolume10D?: number;
  regularMarketVolume?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  bid?: number;
  bidSize?: number;
  ask?: number;
  askSize?: number;
  targetMeanPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  recommendationKey?: string;
  recommendationMean?: number;
  analystCount?: number;
  averageAnalystRating?: string;
  totalRevenue?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  grossMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  returnOnEquity?: number;
  debtToEquity?: number;
  currentRatio?: number;
  freeCashflow?: number;
  totalCash?: number;
  totalDebt?: number;
  earningsDate?: number;
  firstTradeDate?: number;
  timezone?: string;
}

export interface StockDetail {
  symbol: string;
  bars: OhlcvBar[];
  info: StockInfo;
  fetchedAt: string;
  /** When profile/fundamental fields were fetched (may be older than bars in static mode). */
  infoFetchedAt?: string | null;
  source: string;
  errors: string[];
  demo?: boolean;
}

export interface StockSearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
}
