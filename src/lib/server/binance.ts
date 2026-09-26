import type { Bar, Resolution } from "../types";
import { cached, fetchJson, UpstreamError } from "./cache";

function hosts(): string[] {
  const primary = process.env.BINANCE_REST || "https://api.binance.com";
  // data-api.binance.vision serves the same public market data and is reachable from more regions.
  return Array.from(new Set([primary, "https://data-api.binance.vision", "https://api1.binance.com"]));
}

async function get<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const h of hosts()) {
    try {
      return await fetchJson<T>(`${h}${path}`);
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status === 400) break; // bad symbol: no point retrying
    }
  }
  throw lastErr;
}

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

async function klines(symbol: string, interval: string, startTime?: number, limit = 1000): Promise<Kline[]> {
  const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime != null) qs.set("startTime", String(startTime));
  return get<Kline[]>(`/api/v3/klines?${qs}`);
}

const toBar = (k: Kline): Bar => ({
  time: Math.floor(k[0] / 1000),
  open: +k[1],
  high: +k[2],
  low: +k[3],
  close: +k[4],
});

export function binanceHistory(symbol: string, res: Resolution): Promise<Bar[]> {
  if (res === "intraday") {
    return cached(`b:h:i:${symbol}`, 30_000, async () => (await klines(symbol, "30m", undefined, 400)).map(toBar));
  }
  return cached(`b:h:d:${symbol}`, 10 * 60_000, async () => {
    // Walk forward from ~10 years ago (Binance spot data starts in 2017).
    let start = Date.now() - 10 * 365.25 * 86400_000;
    const out: Bar[] = [];
    for (let page = 0; page < 5; page++) {
      const batch = await klines(symbol, "1d", Math.floor(start));
      if (!batch.length) break;
      out.push(...batch.map(toBar));
      if (batch.length < 1000) break;
      start = batch[batch.length - 1][0] + 86400_000;
    }
    return out;
  });
}

export interface Ticker24h {
  symbol: string;
  lastPrice: string;
  prevClosePrice: string;
  priceChange: string;
  priceChangePercent: string;
  openPrice: string;
  closeTime: number;
}

export function binanceTickers(symbols: string[]): Promise<Ticker24h[]> {
  const key = [...symbols].sort().join(",");
  return cached(`b:t:${key}`, 5_000, () =>
    get<Ticker24h[]>(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`),
  );
}

export interface BookTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
}

export function binanceBookTickers(): Promise<BookTicker[]> {
  return cached("b:book", 8_000, () => get<BookTicker[]>("/api/v3/ticker/bookTicker"));
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

export function binanceSymbols(): Promise<SymbolInfo[]> {
  return cached("b:symbols", 6 * 3600_000, async () => {
    const data = await get<{ symbols: SymbolInfo[] }>("/api/v3/exchangeInfo?permissions=SPOT");
    return data.symbols
      .filter((s) => s.status === "TRADING")
      .map(({ symbol, baseAsset, quoteAsset, status }) => ({ symbol, baseAsset, quoteAsset, status }));
  });
}
