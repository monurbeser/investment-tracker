"use client";
import type { SignalScan, StockDetail, StockSearchHit } from "../signals/types";
import { detailPath, SCAN_PATH, unpackDetail, type StoredDetail } from "../signals/store";
import { STATIC } from "./api";

/**
 * Server mode: /api/signals* routes (live Yahoo, any US ticker).
 * Static mode (GitHub Pages): JSON written by scripts/snapshot.ts for the scan universe.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}
const snap = <T,>(rel: string) => json<T>(`${BASE}/${rel}?t=${Math.floor(Date.now() / 60000)}`);

export function fetchScan(): Promise<SignalScan> {
  return STATIC ? snap<SignalScan>(SCAN_PATH).catch(() => Promise.reject(new Error("Sinyal taraması henüz yayınlanmadı (Actions çalışması bekleniyor)"))) : json<SignalScan>("/api/signals");
}

export async function fetchStockDetail(symbol: string): Promise<StockDetail> {
  if (!STATIC) return json<StockDetail>(`/api/signals/detail?symbol=${encodeURIComponent(symbol)}`);
  try {
    return unpackDetail(await snap<StoredDetail>(detailPath(symbol)));
  } catch {
    throw new Error("Statik sürümde yalnızca taranan hisselerin detayı bulunur");
  }
}

export async function searchStocks(q: string, scan: SignalScan | null): Promise<StockSearchHit[]> {
  const Q = q.trim().toUpperCase();
  const local = (scan?.rows ?? [])
    .filter((r) => r.symbol.startsWith(Q) || r.name.toUpperCase().includes(Q))
    .slice(0, 12)
    .map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange }));
  if (STATIC || !Q) return local;
  try {
    const { results } = await json<{ results: StockSearchHit[] }>(`/api/signals/search?q=${encodeURIComponent(Q)}`);
    const seen = new Set(local.map((x) => x.symbol));
    return [...local, ...results.filter((r) => !seen.has(r.symbol))].slice(0, 16);
  } catch {
    return local;
  }
}
