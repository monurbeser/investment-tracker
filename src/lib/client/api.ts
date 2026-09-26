"use client";
import type { ArbitrageResponse, Bar, HistoryResponse, Quote, QuotesResponse, Resolution, SearchResult } from "../types";
import { CATALOG, makeId, resolveInstrument } from "../catalog";
import { indexBooks, premiums, splitSymbol, triangular, TRI_ASSETS, type Book } from "../arbitrage";
import { expandHistory, historyPath, type FxSnapshot, type QuotesSnapshot, type StoredHistory } from "../snapshot";

/**
 * Two data backends:
 *  - server (default): Next.js API routes proxy Yahoo + Binance.
 *  - static (GitHub Pages, NEXT_PUBLIC_STATIC=1): Binance is called live from the
 *    browser; Yahoo-sourced data comes from JSON snapshots refreshed by a
 *    scheduled GitHub Action.
 */
export const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const AED_PEG = 3.6725;

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

// ---------------- Binance (browser, CORS-enabled) ----------------
const BINANCE = ["https://api.binance.com", "https://data-api.binance.vision"];
let binanceHost = 0;

async function binance<T>(path: string): Promise<T> {
  let last: unknown;
  for (let k = 0; k < BINANCE.length; k++) {
    const host = BINANCE[(binanceHost + k) % BINANCE.length];
    try {
      const r = await fetch(`${host}${path}`);
      if (r.status === 400) throw Object.assign(new Error(`Binance: geçersiz sembol`), { fatal: true });
      if (!r.ok) throw new Error(`Binance ${r.status}`);
      binanceHost = (binanceHost + k) % BINANCE.length;
      return (await r.json()) as T;
    } catch (e) {
      last = e instanceof TypeError ? new Error("Binance’e bağlanılamadı (ağ/erişim engeli)") : e;
      if ((e as { fatal?: boolean }).fatal) break;
    }
  }
  throw last instanceof Error ? last : new Error("Binance erişilemedi");
}

type Kline = [number, string, string, string, string, ...unknown[]];
const toBar = (k: Kline): Bar => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] });

async function binanceHistory(symbol: string, res: Resolution): Promise<Bar[]> {
  if (res === "intraday") return (await binance<Kline[]>(`/api/v3/klines?symbol=${symbol}&interval=30m&limit=400`)).map(toBar);
  let start = Date.now() - 10 * 365.25 * 86400_000;
  const out: Bar[] = [];
  for (let page = 0; page < 5; page++) {
    const batch = await binance<Kline[]>(`/api/v3/klines?symbol=${symbol}&interval=1d&limit=1000&startTime=${Math.floor(start)}`);
    out.push(...batch.map(toBar));
    if (batch.length < 1000) break;
    start = batch[batch.length - 1][0] + 86400_000;
  }
  return out;
}

let books: { at: number; list: Book[] } | null = null;
async function binanceBooks(): Promise<Book[]> {
  if (books && Date.now() - books.at < 8000) return books.list;
  const raw = await binance<{ symbol: string; bidPrice: string; askPrice: string }[]>("/api/v3/ticker/bookTicker");
  const list: Book[] = [];
  for (const b of raw) {
    const s = splitSymbol(b.symbol);
    if (s) list.push({ symbol: b.symbol, ...s, bid: +b.bidPrice, ask: +b.askPrice });
  }
  books = { at: Date.now(), list };
  return list;
}

// ---------------- snapshots ----------------
const snap = <T,>(rel: string) => json<T>(`${BASE}/${rel}?t=${Math.floor(Date.now() / 60000)}`);

// ---------------- public API ----------------
export async function fetchQuotes(ids: string[]): Promise<QuotesResponse> {
  if (!STATIC) return json<QuotesResponse>(`/api/quotes?ids=${encodeURIComponent(ids.join(","))}`);
  const fetchedAt = new Date().toISOString();
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  const bin = ids.filter((id) => id.startsWith("binance:")).map((id) => id.slice(8));
  const other = ids.filter((id) => !id.startsWith("binance:"));
  await Promise.all([
    bin.length
      ? binance<{ symbol: string; lastPrice: string; prevClosePrice: string; openPrice: string; priceChange: string; priceChangePercent: string; closeTime: number }[]>(
          `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(bin))}`,
        )
          .then((rows) => {
            for (const r of rows) {
              const id = `binance:${r.symbol}`;
              const usdt = r.symbol.endsWith("USDT");
              quotes[id] = {
                id,
                price: +r.lastPrice,
                prevClose: +r.prevClosePrice || +r.openPrice,
                change: +r.priceChange,
                changePct: +r.priceChangePercent,
                currency: usdt ? "USDT" : "",
                priceUsd: usdt ? +r.lastPrice : null,
                asOf: new Date(r.closeTime).toISOString(),
                fetchedAt,
                source: "Binance",
              };
            }
          })
          .catch((e: Error) => bin.forEach((s) => (errors[`binance:${s}`] = e.message)))
      : Promise.resolve(),
    other.length
      ? snap<QuotesSnapshot>("data/quotes.json")
          .then((s) => {
            for (const id of other) {
              if (s.quotes[id]) quotes[id] = { ...s.quotes[id], fetchedAt: s.fetchedAt };
              else errors[id] = s.errors[id] ?? "Statik sürümde bu sembol için veri yok";
            }
          })
          .catch(() => other.forEach((id) => (errors[id] = "Anlık görüntü yüklenemedi")))
      : Promise.resolve(),
  ]);
  return { quotes, errors, fetchedAt };
}

function alignDaily(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const nb = { ...b, time: Math.floor(b.time / 86400) * 86400 };
    if (out.length && out[out.length - 1].time === nb.time) out[out.length - 1] = nb;
    else out.push(nb);
  }
  return out;
}

export async function fetchHistory(id: string, res: Resolution): Promise<HistoryResponse> {
  if (!STATIC) return json<HistoryResponse>(`/api/history?id=${encodeURIComponent(id)}&res=${res}`);
  const inst = resolveInstrument(id);
  if (!inst) throw new Error("Bilinmeyen enstrüman");
  if (inst.source === "binance") {
    const raw = await binanceHistory(inst.symbol, res);
    const bars = res === "daily" ? alignDaily(raw) : raw;
    return {
      id,
      currency: inst.currency,
      resolution: res,
      bars,
      usd: bars,
      lastDataAt: bars.length ? new Date(bars[bars.length - 1].time * 1000).toISOString() : null,
      fetchedAt: new Date().toISOString(),
      source: "Binance Spot (tarayıcıdan canlı)",
      note: inst.currency === "USDT" ? "USDT ≈ 1 USD kabul edildi" : undefined,
    };
  }
  const r = inst.source === "bond" ? "daily" : res;
  try {
    return expandHistory(await snap<StoredHistory>(historyPath(id, r)));
  } catch {
    throw new Error(CATALOG.some((c) => c.id === id) ? "Anlık görüntü henüz yok (Actions çalışması bekleniyor)" : "Statik sürümde yalnızca katalogdaki semboller ve Binance desteklenir");
  }
}

export async function fetchArbitrage(feePct: number): Promise<ArbitrageResponse> {
  if (!STATIC) return json<ArbitrageResponse>(`/api/arbitrage?fee=${feePct}`);
  const errors: string[] = [];
  const fetchedAt = new Date().toISOString();
  const [fxSnap, list] = await Promise.all([
    snap<FxSnapshot>("data/fx.json").catch(() => (errors.push("Döviz anlık görüntüsü yüklenemedi"), null)),
    binanceBooks().catch((e: Error) => (errors.push(e.message), [] as Book[])),
  ]);
  const idx = indexBooks(list);
  const fx = fxSnap?.fx ?? [];
  const usdAed = fx.find((r) => r.pair === "USDAED=X");
  return {
    triangular: list.length ? triangular(idx, "USDT", TRI_ASSETS, feePct) : [],
    premiums: fxSnap ? premiums(idx, fxSnap.officials, fx.find((r) => r.pair === "EURUSD=X")?.rate ?? null) : [],
    peg: { official: AED_PEG, market: usdAed?.rate ?? null, deviationPct: usdAed?.rate ? (usdAed.rate / AED_PEG - 1) * 100 : null, asOf: usdAed?.asOf ?? null },
    fx,
    feePct,
    fetchedAt,
    errors: [...errors, ...(fxSnap?.errors ?? [])],
  };
}

export async function searchInstruments(q: string, signal?: AbortSignal): Promise<{ results: SearchResult[]; errors: string[] }> {
  if (!STATIC) return json(`/api/search?q=${encodeURIComponent(q)}`);
  const Q = q.toUpperCase();
  const local: SearchResult[] = CATALOG.filter((i) => i.symbol.toUpperCase().includes(Q) || i.name.toUpperCase().includes(Q)).map(
    ({ id, symbol, name, exchange, category, source, currency }) => ({ id, symbol, name, exchange, category, source, currency }),
  );
  const errors: string[] = [];
  let crypto: SearchResult[] = [];
  try {
    if (signal?.aborted) return { results: local, errors };
    crypto = (await binanceBooks())
      .filter((b) => b.quote === "USDT" && (b.base === Q || (Q.length >= 2 && b.base.startsWith(Q))))
      .slice(0, 10)
      .map((b) => ({ id: makeId("binance", b.symbol), symbol: b.symbol, name: `${b.base} / USDT`, exchange: "Binance", type: "Kripto", category: "crypto", source: "binance", currency: "USDT" }));
  } catch (e) {
    errors.push((e as Error).message);
  }
  const seen = new Set<string>();
  const results = [...local, ...crypto].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (!results.length) errors.push("Statik sürümde arama yalnızca katalog ve Binance ile sınırlı");
  return { results, errors };
}
