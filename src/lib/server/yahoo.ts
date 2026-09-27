import type { Bar, Resolution, SearchResult } from "../types";
import { cached, fetchJson, UpstreamError } from "./cache";
import { makeId } from "../catalog";

// YAHOO_BASE lets CI route requests through scripts/yahoo_proxy.py.
export const YAHOO_HOSTS = process.env.YAHOO_BASE ? [process.env.YAHOO_BASE] : ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

interface ChartMeta {
  currency?: string;
  symbol: string;
  exchangeName?: string;
  fullExchangeName?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  instrumentType?: string;
}

interface ChartResponse {
  chart: {
    result?: {
      meta: ChartMeta;
      timestamp?: number[];
      indicators: {
        quote: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[];
        adjclose?: { adjclose?: (number | null)[] }[];
      };
    }[];
    error?: { code: string; description: string } | null;
  };
}

export interface YahooChart {
  meta: ChartMeta;
  bars: Bar[];
}

async function chart(symbol: string, query: string): Promise<YahooChart> {
  let lastErr: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${query}&includePrePost=false&events=div%2Csplits`;
      const data = await fetchJson<ChartResponse>(url);
      const r = data.chart.result?.[0];
      if (!r) throw new UpstreamError(data.chart.error?.description ?? `Yahoo: ${symbol} bulunamadı`, 404);
      const ts = r.timestamp ?? [];
      const q = r.indicators.quote[0] ?? {};
      const adj = r.indicators.adjclose?.[0]?.adjclose;
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = q.close?.[i];
        if (close == null || !isFinite(close)) continue;
        bars.push({
          time: ts[i],
          open: q.open?.[i] ?? undefined,
          high: q.high?.[i] ?? undefined,
          low: q.low?.[i] ?? undefined,
          close,
          adj: adj?.[i] ?? undefined,
        });
      }
      return { meta: r.meta, bars: dedupeByTime(bars) };
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status === 404) break;
    }
  }
  throw lastErr;
}

function dedupeByTime(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    if (out.length && out[out.length - 1].time >= b.time) out[out.length - 1] = b;
    else out.push(b);
  }
  return out;
}

export function yahooHistory(symbol: string, res: Resolution): Promise<YahooChart> {
  return res === "intraday"
    ? cached(`y:h:i:${symbol}`, 60_000, () => chart(symbol, "range=5d&interval=15m"))
    : cached(`y:h:d:${symbol}`, 10 * 60_000, () => chart(symbol, "range=10y&interval=1d"));
}

export function yahooQuote(symbol: string): Promise<YahooChart> {
  return cached(`y:q:${symbol}`, 20_000, () => chart(symbol, "range=1d&interval=5m"));
}

/** Yahoo quotes LSE instruments in pence as "GBp". */
export function normalizeCurrency(cur: string | undefined): { currency: string; factor: number } {
  if (!cur) return { currency: "USD", factor: 1 };
  if (cur === "GBp" || cur === "GBX") return { currency: "GBP", factor: 0.01 };
  if (cur === "ZAc") return { currency: "ZAR", factor: 0.01 };
  if (cur === "ILA") return { currency: "ILS", factor: 0.01 };
  return { currency: cur.toUpperCase(), factor: 1 };
}

interface SearchResponse {
  quotes?: {
    symbol: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    exchange?: string;
    quoteType?: string;
    typeDisp?: string;
  }[];
}

export async function yahooSearch(q: string): Promise<SearchResult[]> {
  return cached(`y:s:${q.toLowerCase()}`, 5 * 60_000, async () => {
    const url = `${YAHOO_HOSTS[YAHOO_HOSTS.length - 1]}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`;
    const data = await fetchJson<SearchResponse>(url);
    return (data.quotes ?? [])
      .filter((x) => x.symbol && ["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(x.quoteType ?? ""))
      .map((x) => {
        const uae = x.symbol.endsWith(".AE");
        const isFund = x.quoteType === "ETF" || x.quoteType === "MUTUALFUND";
        return {
          id: makeId("yahoo", x.symbol),
          symbol: x.symbol,
          name: x.longname ?? x.shortname ?? x.symbol,
          exchange: x.exchDisp ?? x.exchange,
          type: x.typeDisp ?? x.quoteType,
          category: isFund ? "etf" : uae ? "uae" : "us",
          source: "yahoo",
          currency: uae ? "AED" : "USD",
        } satisfies SearchResult;
      });
  });
}
