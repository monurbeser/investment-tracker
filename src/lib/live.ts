import type { Bar, Quote, Resolution } from "./types";

/**
 * Put the live quote on the end of a bar series: replace the close of the
 * current bar or append a new bar when the quote belongs to a later bucket.
 */
export function mergeLive(bars: Bar[], quote: Quote | undefined, res: Resolution, usd: boolean): Bar[] {
  if (!quote || !bars.length || !quote.asOf) return bars;
  const price = usd ? quote.priceUsd : quote.price;
  if (price == null || !isFinite(price) || price <= 0) return bars;
  const t = Math.floor(new Date(quote.asOf).getTime() / 1000);
  const last = bars[bars.length - 1];
  const bucket = res === "daily" ? 86400 : 1800;
  const qb = Math.floor(t / bucket) * bucket;
  if (t < last.time) return bars;
  if (qb <= last.time || (res === "intraday" && t - last.time < bucket)) {
    const nb: Bar = {
      ...last,
      close: price,
      high: last.high != null ? Math.max(last.high, price) : undefined,
      low: last.low != null ? Math.min(last.low, price) : undefined,
      adj: last.adj != null ? last.adj * (price / last.close) : undefined,
    };
    return [...bars.slice(0, -1), nb];
  }
  return [...bars, { time: qb, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, adj: last.adj != null ? last.adj * (price / last.close) : undefined }];
}
