import type { Breadth, OhlcvBar, SignalRow, SignalScan, StockDetail, StockInfo, StockSearchHit } from "../signals/types";
import { analyze, rankSignals, toRow } from "../signals/engine";
import { BENCHMARKS, UNIVERSE, isValidUsSymbol, usExchangeName, type UniverseStock } from "../signals/universe";
import { cached, fetchJson, isDemo, UpstreamError } from "./cache";
import { YAHOO_HOSTS } from "./yahoo";
import { demoBars } from "./demo";

/**
 * Data layer of the US signal platform (Yahoo Finance, free endpoints):
 *  - v8 chart: 5 years of daily OHLCV (no auth)
 *  - v7 quote: Level-1 quote + key statistics (cookie + crumb)
 *  - v10 quoteSummary: profile, analyst targets, financials (cookie + crumb)
 *  - v1 screener (predefined): today's most active / gainers / losers on US exchanges
 * The crumb-protected calls are optional; the platform works on chart data alone.
 */

// ---------------- auth (cookie + crumb) ----------------
type Auth = { cookie: string; crumb: string };
let auth: { value: Auth | null; at: number } | null = null;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function yahooAuth(): Promise<Auth | null> {
  // scripts/yahoo_proxy.py adds its own session cookie and crumb.
  if (process.env.YAHOO_BASE) return { cookie: "", crumb: "" };
  if (auth && Date.now() - auth.at < (auth.value ? 30 * 60_000 : 2 * 60_000)) return auth.value;
  let value: Auth | null = null;
  try {
    const r = await fetch("https://fc.yahoo.com/", { redirect: "manual", headers: { "User-Agent": UA }, cache: "no-store" });
    const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const c = await fetch(`${YAHOO_HOSTS[YAHOO_HOSTS.length - 1]}/v1/test/getcrumb`, { headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store" });
    const crumb = (await c.text()).trim();
    if (c.ok && crumb && !crumb.includes("<") && crumb.length < 40) value = { cookie, crumb };
  } catch {
    /* no auth: crumb endpoints are skipped */
  }
  auth = { value, at: Date.now() };
  return value;
}

async function yget<T>(path: string, needsCrumb = false): Promise<T> {
  let a: Auth | null = null;
  if (needsCrumb) {
    a = await yahooAuth();
    if (!a) throw new UpstreamError("Yahoo oturum anahtarı (crumb) alınamadı");
  }
  let last: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}${path}${a?.crumb ? `${path.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(a.crumb)}` : ""}`;
      return await fetchJson<T>(url, { headers: a?.cookie ? { Cookie: a.cookie } : {}, timeoutMs: 15000 });
    } catch (e) {
      last = e;
      if (e instanceof UpstreamError && (e.status === 401 || e.status === 403) && needsCrumb) auth = null;
      if (e instanceof UpstreamError && e.status === 404) break;
    }
  }
  throw last;
}

// ---------------- daily OHLCV ----------------
export interface ChartMeta {
  symbol: string;
  currency?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  chartPreviousClose?: number;
  firstTradeDate?: number;
  exchangeTimezoneName?: string;
}

interface ChartResponse {
  chart: {
    result?: {
      meta: ChartMeta;
      timestamp?: number[];
      indicators: { quote: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { description: string } | null;
  };
}

export interface Daily {
  meta: ChartMeta;
  bars: OhlcvBar[];
}

function parseChart(data: ChartResponse, symbol: string): Daily {
  const r = data.chart.result?.[0];
  if (!r) throw new UpstreamError(data.chart.error?.description ?? `${symbol} bulunamadı`, 404);
  const ts = r.timestamp ?? [];
  const q = r.indicators.quote[0] ?? {};
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null || !isFinite(c) || c <= 0) continue;
    const o = q.open?.[i] ?? c;
    const time = Math.floor(ts[i] / 86400) * 86400;
    const bar = { time, open: o, high: Math.max(q.high?.[i] ?? c, o, c), low: Math.min(q.low?.[i] ?? c, o, c), close: c, volume: q.volume?.[i] ?? 0 };
    if (bars.length && bars[bars.length - 1].time === time) bars[bars.length - 1] = bar;
    else bars.push(bar);
  }
  return { meta: r.meta, bars };
}

export function fetchDaily(symbol: string): Promise<Daily> {
  if (isDemo()) return Promise.resolve(demoDaily(symbol));
  return cached(`us:d:${symbol}`, 10 * 60_000, async () =>
    parseChart(await yget<ChartResponse>(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&includePrePost=false&events=div%2Csplits`), symbol),
  );
}

// ---------------- v7 quote ----------------
type Raw = Record<string, unknown>;
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && typeof (v as { raw?: unknown }).raw === "number") return (v as { raw: number }).raw;
  return undefined;
};
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function fill(target: StockInfo, src: StockInfo) {
  for (const [k, v] of Object.entries(src)) if (v !== undefined && (target as Raw)[k] === undefined) (target as Raw)[k] = v;
  return target;
}

function fromV7(q: Raw): StockInfo {
  return {
    longName: str(q.longName),
    shortName: str(q.shortName),
    exchange: str(q.exchange),
    fullExchangeName: str(q.fullExchangeName),
    quoteType: str(q.quoteType),
    currency: str(q.currency),
    marketState: str(q.marketState),
    marketCap: num(q.marketCap),
    trailingPE: num(q.trailingPE),
    forwardPE: num(q.forwardPE),
    priceToBook: num(q.priceToBook),
    eps: num(q.epsTrailingTwelveMonths),
    epsForward: num(q.epsForward),
    bookValue: num(q.bookValue),
    dividendRate: num(q.trailingAnnualDividendRate),
    dividendYield: num(q.trailingAnnualDividendYield),
    sharesOutstanding: num(q.sharesOutstanding),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    fiftyDayAverage: num(q.fiftyDayAverage),
    twoHundredDayAverage: num(q.twoHundredDayAverage),
    avgVolume3M: num(q.averageDailyVolume3Month),
    avgVolume10D: num(q.averageDailyVolume10Day),
    regularMarketVolume: num(q.regularMarketVolume),
    regularMarketOpen: num(q.regularMarketOpen),
    regularMarketDayHigh: num(q.regularMarketDayHigh),
    regularMarketDayLow: num(q.regularMarketDayLow),
    regularMarketPreviousClose: num(q.regularMarketPreviousClose),
    regularMarketPrice: num(q.regularMarketPrice),
    regularMarketTime: num(q.regularMarketTime),
    preMarketPrice: num(q.preMarketPrice),
    preMarketChangePercent: num(q.preMarketChangePercent),
    postMarketPrice: num(q.postMarketPrice),
    postMarketChangePercent: num(q.postMarketChangePercent),
    bid: num(q.bid),
    bidSize: num(q.bidSize),
    ask: num(q.ask),
    askSize: num(q.askSize),
    averageAnalystRating: str(q.averageAnalystRating),
    earningsDate: num(q.earningsTimestamp),
    firstTradeDate: num(q.firstTradeDateMilliseconds) != null ? Math.floor(num(q.firstTradeDateMilliseconds)! / 1000) : undefined,
    timezone: str(q.exchangeTimezoneName),
  };
}

/** Batched v7 quotes (≤ 50 symbols per request). */
export async function quoteBatch(symbols: string[]): Promise<Record<string, StockInfo>> {
  if (isDemo()) return Object.fromEntries(symbols.map((s) => [s, demoInfo(s)]));
  const out: Record<string, StockInfo> = {};
  for (let k = 0; k < symbols.length; k += 50) {
    const chunk = symbols.slice(k, k + 50);
    const data = await cached(`us:q:${chunk.join(",")}`, 60_000, () =>
      yget<{ quoteResponse?: { result?: Raw[] } }>(`/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(","))}&formatted=false&lang=en-US&region=US`, true),
    );
    for (const q of data.quoteResponse?.result ?? []) if (typeof q.symbol === "string") out[q.symbol] = fromV7(q);
  }
  return out;
}

// ---------------- v10 quoteSummary ----------------
const MODULES = "assetProfile,summaryDetail,financialData,defaultKeyStatistics,calendarEvents";

export async function stockProfile(symbol: string): Promise<StockInfo> {
  if (isDemo()) return demoInfo(symbol);
  return cached(`us:p:${symbol}`, 6 * 3600_000, async () => {
    const data = await yget<{ quoteSummary?: { result?: Raw[] } }>(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&formatted=false&lang=en-US&region=US`, true);
    const r = data.quoteSummary?.result?.[0] ?? {};
    const ap = (r.assetProfile ?? {}) as Raw;
    const sd = (r.summaryDetail ?? {}) as Raw;
    const fd = (r.financialData ?? {}) as Raw;
    const ks = (r.defaultKeyStatistics ?? {}) as Raw;
    const ce = (r.calendarEvents ?? {}) as { earnings?: { earningsDate?: unknown[] } };
    return {
      sector: str(ap.sector),
      industry: str(ap.industry),
      country: str(ap.country),
      city: str(ap.city),
      website: str(ap.website),
      employees: num(ap.fullTimeEmployees),
      summary: str(ap.longBusinessSummary),
      marketCap: num(sd.marketCap),
      trailingPE: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE),
      priceToSales: num(sd.priceToSalesTrailing12Months),
      dividendRate: num(sd.dividendRate),
      dividendYield: num(sd.dividendYield),
      exDividendDate: num(sd.exDividendDate),
      beta: num(sd.beta) ?? num(ks.beta),
      bid: num(sd.bid),
      ask: num(sd.ask),
      bidSize: num(sd.bidSize),
      askSize: num(sd.askSize),
      enterpriseValue: num(ks.enterpriseValue),
      pegRatio: num(ks.pegRatio),
      floatShares: num(ks.floatShares),
      sharesOutstanding: num(ks.sharesOutstanding),
      shortPercentOfFloat: num(ks.shortPercentOfFloat),
      shortRatio: num(ks.shortRatio),
      heldByInsiders: num(ks.heldPercentInsiders),
      heldByInstitutions: num(ks.heldPercentInstitutions),
      targetMeanPrice: num(fd.targetMeanPrice),
      targetHighPrice: num(fd.targetHighPrice),
      targetLowPrice: num(fd.targetLowPrice),
      recommendationKey: str(fd.recommendationKey),
      recommendationMean: num(fd.recommendationMean),
      analystCount: num(fd.numberOfAnalystOpinions),
      totalRevenue: num(fd.totalRevenue),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      grossMargins: num(fd.grossMargins),
      operatingMargins: num(fd.operatingMargins),
      profitMargins: num(fd.profitMargins),
      returnOnEquity: num(fd.returnOnEquity),
      debtToEquity: num(fd.debtToEquity),
      currentRatio: num(fd.currentRatio),
      freeCashflow: num(fd.freeCashflow),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
      earningsDate: num(ce.earnings?.earningsDate?.[0]),
    } satisfies StockInfo;
  });
}

function fromMeta(m: ChartMeta): StockInfo {
  return {
    longName: m.longName,
    shortName: m.shortName,
    exchange: m.exchangeName,
    fullExchangeName: m.fullExchangeName,
    quoteType: m.instrumentType,
    currency: m.currency,
    regularMarketPrice: m.regularMarketPrice,
    regularMarketTime: m.regularMarketTime,
    regularMarketDayHigh: m.regularMarketDayHigh,
    regularMarketDayLow: m.regularMarketDayLow,
    regularMarketVolume: m.regularMarketVolume,
    regularMarketPreviousClose: m.chartPreviousClose,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow,
    firstTradeDate: m.firstTradeDate,
    timezone: m.exchangeTimezoneName,
  };
}

// ---------------- screener discovery ----------------
const SCREENERS = ["most_actives", "day_gainers", "day_losers", "small_cap_gainers", "growth_technology_stocks", "undervalued_large_caps"];

/** Stocks the US screeners list today (all US exchanges). */
export async function discover(): Promise<UniverseStock[]> {
  if (isDemo()) return [];
  return cached("us:discover", 15 * 60_000, async () => {
    const seen = new Map<string, UniverseStock>();
    await Promise.all(
      SCREENERS.map(async (id) => {
        try {
          const d = await yget<{ finance?: { result?: { quotes?: Raw[] }[] } }>(`/v1/finance/screener/predefined/saved?scrIds=${id}&count=50&formatted=false&lang=en-US&region=US`, true);
          for (const q of d.finance?.result?.[0]?.quotes ?? []) {
            const symbol = str(q.symbol);
            const ex = usExchangeName(str(q.exchange), str(q.fullExchangeName));
            if (!symbol || !ex || q.quoteType !== "EQUITY" || !isValidUsSymbol(symbol) || seen.has(symbol)) continue;
            seen.set(symbol, { symbol, name: str(q.longName) ?? str(q.shortName) ?? symbol, exchange: ex, sector: "" });
          }
        } catch {
          /* a single screener failing is fine */
        }
      }),
    );
    return [...seen.values()];
  });
}

// ---------------- search ----------------
export async function searchUs(q: string): Promise<StockSearchHit[]> {
  if (isDemo()) {
    const Q = q.toUpperCase();
    return UNIVERSE.filter((s) => s.symbol.startsWith(Q) || s.name.toUpperCase().includes(Q)).slice(0, 12).map(({ symbol, name, exchange }) => ({ symbol, name, exchange }));
  }
  return cached(`us:s:${q.toLowerCase()}`, 5 * 60_000, async () => {
    const d = await yget<{ quotes?: Raw[] }>(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`);
    const out: StockSearchHit[] = [];
    for (const x of d.quotes ?? []) {
      const symbol = str(x.symbol);
      const ex = usExchangeName(str(x.exchange), str(x.exchDisp));
      if (!symbol || !ex || !["EQUITY", "ETF"].includes(String(x.quoteType))) continue;
      out.push({ symbol, name: str(x.longname) ?? str(x.shortname) ?? symbol, exchange: ex, type: str(x.typeDisp) ?? str(x.quoteType) });
    }
    return out;
  });
}

// ---------------- scan ----------------
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
    }),
  );
}

export interface ScanResult {
  scan: SignalScan;
  daily: Map<string, Daily>;
}

function breadthOf(daily: Map<string, Daily>, rows: SignalRow[]): Breadth {
  let above50 = 0;
  let above200 = 0;
  let total = 0;
  for (const r of rows) {
    const bars = daily.get(r.symbol)?.bars;
    if (!bars || bars.length < 200) continue;
    total++;
    const avg = (n: number) => bars.slice(-n).reduce((a, b) => a + b.close, 0) / n;
    const c = bars[bars.length - 1].close;
    if (c > avg(50)) above50++;
    if (c > avg(200)) above200++;
  }
  return {
    total,
    above50,
    above200,
    buys: rows.filter((r) => r.rec === "buy" || r.rec === "strong_buy").length,
    sells: rows.filter((r) => r.rec === "sell" || r.rec === "strong_sell").length,
    holds: rows.filter((r) => r.rec === "hold").length,
    advancers: rows.filter((r) => (r.changePct ?? 0) > 0).length,
    decliners: rows.filter((r) => (r.changePct ?? 0) < 0).length,
  };
}

export async function runScan(opts: { concurrency?: number; log?: (s: string) => void } = {}): Promise<ScanResult> {
  const errors: string[] = [];
  const discovered = await discover().catch(() => [] as UniverseStock[]);
  const known = new Set(UNIVERSE.map((s) => s.symbol));
  const extra = discovered.filter((s) => !known.has(s.symbol)).slice(0, 150);
  const list = [...UNIVERSE, ...extra];
  const daily = new Map<string, Daily>();
  const failed: string[] = [];

  await pool([...list, ...BENCHMARKS], opts.concurrency ?? 8, async (s) => {
    try {
      daily.set(s.symbol, await fetchDaily(s.symbol));
    } catch (e) {
      failed.push(`${s.symbol}: ${(e as Error).message}`);
    }
  });
  if (failed.length) errors.push(`${failed.length} sembol alınamadı (${failed.slice(0, 5).join("; ")}${failed.length > 5 ? " …" : ""})`);
  opts.log?.(`scan: ${daily.size}/${list.length + BENCHMARKS.length} histories`);

  let caps: Record<string, StockInfo> = {};
  try {
    caps = await quoteBatch(list.map((s) => s.symbol));
  } catch (e) {
    errors.push(`Piyasa değeri verisi alınamadı: ${(e as Error).message}`);
  }

  const toRows = (stocks: UniverseStock[]) => {
    const rows: SignalRow[] = [];
    for (const s of stocks) {
      const d = daily.get(s.symbol);
      if (!d) continue;
      const a = analyze(d.bars);
      if (!a) continue;
      rows.push(
        toRow(
          {
            symbol: s.symbol,
            name: caps[s.symbol]?.longName ?? d.meta.longName ?? s.name,
            exchange: usExchangeName(d.meta.exchangeName, d.meta.fullExchangeName) ?? s.exchange,
            sector: s.sector || undefined,
            marketCap: caps[s.symbol]?.marketCap ?? null,
          },
          d.bars,
          a,
        ),
      );
    }
    return rows;
  };
  const rows = toRows(list);
  const benchmarks = toRows(BENCHMARKS);
  const { buys, sells } = rankSignals(rows);
  const last = Math.max(0, ...rows.map((r) => r.asOf));
  return {
    daily,
    scan: {
      generatedAt: new Date().toISOString(),
      lastDataAt: last ? new Date(last * 1000).toISOString() : null,
      universe: list.length,
      scanned: rows.length,
      buys,
      sells,
      rows: rows.sort((a, b) => b.score - a.score),
      breadth: breadthOf(daily, rows),
      benchmarks,
      discovered: extra.length,
      errors,
      source: isDemo() ? "DEMO (sentetik)" : "Yahoo Finance (günlük OHLCV, 5 yıl)",
      demo: isDemo() || undefined,
    },
  };
}

// Stale-while-revalidate: a full scan takes a while, so serve the previous one while refreshing.
let scanState: { value: SignalScan | null; at: number; pending: Promise<SignalScan> | null } = { value: null, at: 0, pending: null };
const SCAN_TTL = 15 * 60_000;

export async function getSignalScan(): Promise<SignalScan> {
  const fresh = scanState.value && Date.now() - scanState.at < SCAN_TTL;
  if (fresh) return scanState.value!;
  if (!scanState.pending) {
    scanState.pending = runScan()
      .then(({ scan }) => {
        scanState = { value: scan, at: Date.now(), pending: null };
        return scan;
      })
      .catch((e) => {
        scanState.pending = null;
        throw e;
      });
  }
  return scanState.value ?? scanState.pending;
}

// ---------------- detail ----------------
export interface DetailOptions {
  daily?: Daily;
  /** Reuse an earlier profile instead of calling quoteSummary (static snapshots). */
  profile?: { info: StockInfo; fetchedAt: string | null };
}

export async function getStockDetail(symbol: string, opts: DetailOptions = {}): Promise<StockDetail> {
  const errors: string[] = [];
  const d = opts.daily ?? (await fetchDaily(symbol));
  const ex = usExchangeName(d.meta.exchangeName, d.meta.fullExchangeName);
  if (!ex && !isDemo()) throw new UpstreamError(`${symbol} bir ABD borsasında işlem görmüyor (${d.meta.fullExchangeName ?? d.meta.exchangeName ?? "?"})`, 400);
  const info: StockInfo = {};
  const [q, p] = await Promise.allSettled([quoteBatch([symbol]), opts.profile ? Promise.resolve(opts.profile.info) : stockProfile(symbol)]);
  if (q.status === "fulfilled" && q.value[symbol]) fill(info, q.value[symbol]);
  else errors.push(`Anlık kotasyon/derinlik verisi alınamadı${q.status === "rejected" ? `: ${(q.reason as Error).message}` : ""}`);
  if (p.status === "fulfilled") fill(info, p.value);
  else errors.push(`Şirket profili / analist verisi alınamadı: ${(p.reason as Error).message}`);
  fill(info, fromMeta(d.meta));
  const u = UNIVERSE.find((s) => s.symbol === symbol) ?? BENCHMARKS.find((s) => s.symbol === symbol);
  if (!info.sector && u?.sector) info.sector = u.sector;
  if (!info.longName && u) info.longName = u.name;
  info.fullExchangeName = ex ?? info.fullExchangeName ?? u?.exchange;
  return {
    symbol,
    bars: d.bars,
    info,
    fetchedAt: new Date().toISOString(),
    infoFetchedAt: opts.profile ? opts.profile.fetchedAt : new Date().toISOString(),
    source: isDemo() ? "DEMO (sentetik)" : "Yahoo Finance",
    errors,
    demo: isDemo() || undefined,
  };
}

// ---------------- demo ----------------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function demoDaily(symbol: string): Daily {
  const raw = demoBars(`yahoo:${symbol}`, "daily").slice(-1260);
  const base = 2e6 + (hash(symbol) % 40) * 1e6;
  const bars: OhlcvBar[] = raw.map((b, i) => {
    const prev = i ? raw[i - 1].close : b.close;
    const move = Math.abs(b.close / prev - 1);
    const wobble = ((hash(`${symbol}${i}`) % 1000) / 1000) * 0.8 + 0.6;
    return { time: b.time, open: b.open ?? b.close, high: b.high ?? b.close, low: b.low ?? b.close, close: b.close, volume: Math.round(base * wobble * (1 + move * 25)) };
  });
  const u = UNIVERSE.find((s) => s.symbol === symbol) ?? BENCHMARKS.find((s) => s.symbol === symbol);
  const last = bars[bars.length - 1];
  return {
    meta: {
      symbol,
      currency: "USD",
      exchangeName: u?.exchange === "NYSE" ? "NYQ" : u?.exchange === "NYSE American" ? "ASE" : u?.exchange === "NYSE Arca" ? "PCX" : "NMS",
      fullExchangeName: u?.exchange ?? "NASDAQ",
      instrumentType: "EQUITY",
      longName: u?.name ?? symbol,
      regularMarketPrice: last.close,
      regularMarketTime: last.time + 72000,
      regularMarketVolume: last.volume,
      regularMarketDayHigh: last.high,
      regularMarketDayLow: last.low,
    },
    bars,
  };
}

function demoInfo(symbol: string): StockInfo {
  const d = demoDaily(symbol);
  const p = d.bars[d.bars.length - 1].close;
  const h = hash(symbol);
  const shares = (200 + (h % 5000)) * 1e6;
  return {
    longName: d.meta.longName,
    marketCap: p * shares,
    sharesOutstanding: shares,
    trailingPE: 12 + (h % 40),
    forwardPE: 10 + (h % 30),
    eps: p / (12 + (h % 40)),
    beta: 0.6 + (h % 120) / 100,
    bid: p * 0.9998,
    ask: p * 1.0002,
    bidSize: 100 * (1 + (h % 30)),
    askSize: 100 * (1 + (h % 25)),
    targetMeanPrice: p * (1 + ((h % 30) - 8) / 100),
    analystCount: 5 + (h % 35),
    recommendationKey: "buy",
    sector: UNIVERSE.find((s) => s.symbol === symbol)?.sector,
  };
}
