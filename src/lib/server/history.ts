import type { HistoryResponse, Instrument, Quote, QuotesResponse, Resolution } from "../types";
import { resolveInstrument } from "../catalog";
import { isDemo } from "./cache";
import { normalizeCurrency, yahooHistory, yahooQuote } from "./yahoo";
import { binanceHistory, binanceTickers } from "./binance";
import { bondModel } from "./bond";
import { toUsd, usdRateNow } from "./fx";
import { demoBars } from "./demo";

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);

export async function getHistory(inst: Instrument, res: Resolution): Promise<HistoryResponse> {
  const h = await loadHistory(inst, res);
  if (h.resolution === "daily") {
    h.bars = alignDaily(h.bars);
    h.usd = alignDaily(h.usd);
  }
  return h;
}

/** Stamp daily bars at 00:00 UTC of their trading day so different markets line up on one axis. */
function alignDaily<T extends { time: number }>(bars: T[]): T[] {
  const out: T[] = [];
  for (const b of bars) {
    const t = Math.floor(b.time / 86400) * 86400;
    const nb = { ...b, time: t };
    if (out.length && out[out.length - 1].time === t) out[out.length - 1] = nb;
    else out.push(nb);
  }
  return out;
}

async function loadHistory(inst: Instrument, res: Resolution): Promise<HistoryResponse> {
  const fetchedAt = new Date().toISOString();

  if (isDemo()) {
    const bars = demoBars(inst.id, inst.source === "bond" ? "daily" : res);
    const { bars: usd } = await toUsdSafe(bars, inst.currency);
    return {
      id: inst.id,
      currency: inst.currency,
      resolution: res,
      bars,
      usd,
      lastDataAt: iso(bars.at(-1)?.time),
      fetchedAt,
      source: "DEMO (sentetik)",
      demo: true,
    };
  }

  if (inst.source === "yahoo") {
    const { meta, bars: raw } = await yahooHistory(inst.symbol, res);
    const { currency, factor } = normalizeCurrency(meta.currency ?? inst.currency);
    const bars = factor === 1 ? raw : raw.map((b) => mul(b, factor));
    const conv = await toUsd(bars, currency);
    return {
      id: inst.id,
      currency,
      resolution: res,
      bars,
      usd: conv.bars,
      lastDataAt: iso(meta.regularMarketTime ?? bars.at(-1)?.time),
      fetchedAt,
      source: `Yahoo Finance${meta.fullExchangeName ? ` · ${meta.fullExchangeName}` : ""}`,
      note: conv.note,
    };
  }

  if (inst.source === "binance") {
    const bars = await binanceHistory(inst.symbol, res);
    const conv = await toUsd(bars, inst.currency);
    return {
      id: inst.id,
      currency: inst.currency,
      resolution: res,
      bars,
      usd: conv.bars,
      lastDataAt: iso(bars.at(-1)?.time),
      fetchedAt,
      source: "Binance Spot",
      note: conv.note,
    };
  }

  // bond model: daily only
  const model = await bondModel(inst.bond!);
  return {
    id: inst.id,
    currency: "USD",
    resolution: "daily",
    bars: model.bars,
    usd: model.bars,
    lastDataAt: iso(model.lastDataAt),
    fetchedAt,
    source: "Model · Yahoo (ABD Hazine getirisi)",
    note: `${model.note} Güncel model getiri: %${model.yieldPct.toFixed(2)}.`,
  };
}

async function toUsdSafe(bars: HistoryResponse["bars"], currency: string) {
  try {
    return await toUsd(bars, currency);
  } catch {
    return { bars, note: undefined };
  }
}

function mul(b: HistoryResponse["bars"][number], f: number) {
  return {
    time: b.time,
    open: b.open != null ? b.open * f : undefined,
    high: b.high != null ? b.high * f : undefined,
    low: b.low != null ? b.low * f : undefined,
    close: b.close * f,
    adj: b.adj != null ? b.adj * f : undefined,
  };
}

export async function getQuotes(ids: string[]): Promise<QuotesResponse> {
  const fetchedAt = new Date().toISOString();
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  const insts = ids.map((id) => resolveInstrument(id)).filter((x): x is Instrument => !!x);
  for (const id of ids) if (!insts.find((i) => i.id === id)) errors[id] = "Bilinmeyen enstrüman";

  if (isDemo()) {
    for (const inst of insts) {
      const bars = demoBars(inst.id, "daily");
      const last = bars.at(-1)!;
      const prev = bars.at(-2)!;
      // small wiggle so the demo ticker visibly moves
      const price = last.close * (1 + Math.sin(Date.now() / 7000 + inst.id.length) * 0.002);
      quotes[inst.id] = mkQuote(inst.id, price, prev.close, inst.currency, usdRateNow(inst.currency) ?? 1, last.time, fetchedAt, "DEMO");
      quotes[inst.id].demo = true;
    }
    return { quotes, errors, fetchedAt, demo: true };
  }

  const fxNeeded = new Set<string>();
  const tasks: Promise<void>[] = [];

  const bin = insts.filter((i) => i.source === "binance");
  if (bin.length) {
    tasks.push(
      binanceTickers(bin.map((i) => i.symbol))
        .then((rows) => {
          for (const r of rows) {
            const inst = bin.find((i) => i.symbol === r.symbol)!;
            quotes[inst.id] = mkQuote(
              inst.id,
              +r.lastPrice,
              +r.prevClosePrice || +r.openPrice,
              inst.currency,
              usdRateNow(inst.currency),
              Math.floor(r.closeTime / 1000),
              fetchedAt,
              "Binance",
            );
            // 24h change as reported by Binance (rolling window)
            quotes[inst.id].change = +r.priceChange;
            quotes[inst.id].changePct = +r.priceChangePercent;
          }
        })
        .catch((e) => bin.forEach((i) => (errors[i.id] = (e as Error).message))),
    );
  }

  for (const inst of insts.filter((i) => i.source === "yahoo")) {
    tasks.push(
      yahooQuote(inst.symbol)
        .then(({ meta, bars }) => {
          const { currency, factor } = normalizeCurrency(meta.currency ?? inst.currency);
          const price = (meta.regularMarketPrice ?? bars.at(-1)?.close ?? NaN) * factor;
          const prevRaw = meta.chartPreviousClose ?? meta.previousClose;
          const prev = prevRaw != null ? prevRaw * factor : null;
          if (usdRateNow(currency) == null) fxNeeded.add(currency);
          quotes[inst.id] = mkQuote(inst.id, price, prev, currency, usdRateNow(currency), meta.regularMarketTime ?? bars.at(-1)?.time ?? null, fetchedAt, "Yahoo Finance");
        })
        .catch((e) => void (errors[inst.id] = (e as Error).message)),
    );
  }

  for (const inst of insts.filter((i) => i.source === "bond")) {
    tasks.push(
      bondModel(inst.bond!)
        .then((m) => {
          const last = m.bars.at(-1);
          const prev = m.bars.at(-2);
          if (!last) throw new Error("Getiri verisi yok");
          quotes[inst.id] = mkQuote(inst.id, last.close, prev?.close ?? null, "USD", 1, m.lastDataAt, fetchedAt, `Model (getiri %${m.yieldPct.toFixed(2)})`);
        })
        .catch((e) => void (errors[inst.id] = (e as Error).message)),
    );
  }

  await Promise.all(tasks);

  // Convert non-pegged currencies (EUR, GBP, ...) with the live FX quote.
  await Promise.all(
    [...fxNeeded].map(async (cur) => {
      try {
        const { meta } = await yahooQuote(`${cur}USD=X`);
        const rate = meta.regularMarketPrice;
        for (const q of Object.values(quotes)) if (q.currency === cur && rate) q.priceUsd = q.price * rate;
      } catch {
        /* leave priceUsd null */
      }
    }),
  );

  return { quotes, errors, fetchedAt };
}

function mkQuote(
  id: string,
  price: number,
  prevClose: number | null,
  currency: string,
  usdRate: number | null,
  asOfSec: number | null,
  fetchedAt: string,
  source: string,
): Quote {
  const change = prevClose != null ? price - prevClose : null;
  return {
    id,
    price,
    prevClose,
    change,
    changePct: prevClose ? (change! / prevClose) * 100 : null,
    currency,
    priceUsd: usdRate != null ? price * usdRate : null,
    asOf: iso(asOfSec),
    fetchedAt,
    source,
  };
}
