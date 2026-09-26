"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Quote, QuotesResponse } from "../types";

export interface QuotesState {
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  lastFetch: string | null;
  demo: boolean;
  wsConnected: boolean;
}

/**
 * Polls /api/quotes for all ids and, for Binance USDT pairs, overlays a live
 * WebSocket stream (miniTicker) straight from Binance in the browser.
 */
export function useQuotes(ids: string[], intervalMs = 15000): QuotesState {
  const key = useMemo(() => Array.from(new Set(ids)).sort().join(","), [ids]);
  const [state, setState] = useState<QuotesState>({ quotes: {}, errors: {}, lastFetch: null, demo: false, wsConnected: false });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/quotes?ids=${encodeURIComponent(key)}`);
        const data = (await r.json()) as QuotesResponse;
        if (!alive) return;
        setState((s) => {
          const quotes = { ...s.quotes };
          for (const [id, q] of Object.entries(data.quotes)) {
            const cur = quotes[id];
            // Never let a slower REST snapshot overwrite a newer WebSocket tick.
            if (cur && cur.source === "Binance WS" && cur.asOf && q.asOf && cur.asOf > q.asOf) continue;
            quotes[id] = q;
          }
          return { ...s, quotes, errors: data.errors ?? {}, lastFetch: data.fetchedAt, demo: !!data.demo };
        });
      } catch {
        /* keep the last good snapshot */
      } finally {
        if (alive) timer = setTimeout(load, intervalMs);
      }
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, intervalMs]);

  const cryptoKey = useMemo(
    () =>
      key
        .split(",")
        .filter((id) => id.startsWith("binance:"))
        .map((id) => id.slice(8).toLowerCase())
        .join("/"),
    [key],
  );

  const pending = useRef<Record<string, Quote>>({});
  useEffect(() => {
    if (!cryptoKey || state.demo) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const streams = cryptoKey.split("/").map((s) => `${s}@miniTicker`).join("/");
    const flush = setInterval(() => {
      const batch = pending.current;
      if (!Object.keys(batch).length) return;
      pending.current = {};
      setState((s) => ({ ...s, quotes: { ...s.quotes, ...batch } }));
    }, 1000);

    const connect = () => {
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      ws.onopen = () => setState((s) => ({ ...s, wsConnected: true }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { data: { s: string; c: string; o: string; E: number } };
          const d = msg.data;
          const id = `binance:${d.s}`;
          const price = +d.c;
          const open = +d.o;
          pending.current[id] = {
            id,
            price,
            prevClose: open,
            change: price - open,
            changePct: open ? (price / open - 1) * 100 : null,
            currency: d.s.endsWith("USDT") ? "USDT" : "",
            priceUsd: d.s.endsWith("USDT") ? price : null,
            asOf: new Date(d.E).toISOString(),
            fetchedAt: new Date().toISOString(),
            source: "Binance WS",
          };
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setState((s) => ({ ...s, wsConnected: false }));
        if (!closed) retry = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(flush);
      ws?.close();
    };
  }, [cryptoKey, state.demo]);

  return state;
}
