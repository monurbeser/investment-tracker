import type { Bar, Resolution } from "../types";

/**
 * Synthetic data for DATA_MODE=demo only (offline UI development).
 * Always flagged as demo in API responses and in the UI.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE: Record<string, number> = { BTCUSDT: 95000, ETHUSDT: 3600, BNBUSDT: 650, SOLUSDT: 190, "^GSPC": 6500, "^IXIC": 21000, "^DJI": 45000 };

export function demoBars(id: string, res: Resolution): Bar[] {
  const sym = id.split(":")[1] ?? id;
  const r = rng(hash(id));
  const crypto = id.startsWith("binance:");
  const vol = crypto ? 0.035 : id.startsWith("bond:") ? 0.003 : 0.014;
  const drift = (r() - 0.35) * 0.0009;
  const step = res === "intraday" ? 1800 : 86400;
  const n = res === "intraday" ? 336 : 3650;
  const now = Math.floor(Date.now() / 1000 / step) * step;
  const raw: number[] = [1];
  for (let i = 1; i < n; i++) {
    const g = (r() + r() + r() - 1.5) * 2;
    raw.push(raw[i - 1] * Math.exp(drift * (step / 86400) + vol * Math.sqrt(step / 86400) * g));
  }
  const target = BASE[sym] ?? 5 + (hash(sym) % 400);
  const k = target / raw[n - 1];
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const t = now - (n - 1 - i) * step;
    const day = new Date(t * 1000).getUTCDay();
    if (!crypto && res === "daily" && (day === 0 || day === 6)) continue;
    const c = raw[i] * k;
    const o = (i ? raw[i - 1] : raw[i]) * k;
    const w = Math.abs(c - o) + c * vol * 0.4 * r();
    bars.push({ time: t, open: o, high: Math.max(o, c) + w * 0.5, low: Math.min(o, c) - w * 0.5, close: c, adj: c });
  }
  return bars;
}
