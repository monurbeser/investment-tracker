/**
 * Technical indicator series. Every function returns an array aligned with its
 * input; positions without enough history are NaN. Only past data is used at
 * each index (no look-ahead), so any index can be scored as "today".
 */

export type Series = number[];

const nanArray = (n: number): Series => new Array<number>(n).fill(NaN);

export function sma(x: Series, n: number): Series {
  const out = nanArray(x.length);
  let sum = 0;
  let bad = 0; // non-finite values inside the window
  for (let i = 0; i < x.length; i++) {
    if (isFinite(x[i])) sum += x[i];
    else bad++;
    if (i >= n) {
      if (isFinite(x[i - n])) sum -= x[i - n];
      else bad--;
    }
    if (i >= n - 1 && bad === 0) out[i] = sum / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first `n` finite values. */
export function ema(x: Series, n: number): Series {
  return smooth(x, n, 2 / (n + 1));
}

/** Wilder's moving average (RMA), used by RSI / ATR / ADX. */
export function rma(x: Series, n: number): Series {
  return smooth(x, n, 1 / n);
}

function smooth(x: Series, n: number, k: number): Series {
  const out = nanArray(x.length);
  let prev = NaN;
  let seed = 0;
  let seen = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!isFinite(v)) {
      if (isFinite(prev)) out[i] = prev;
      continue;
    }
    if (!isFinite(prev)) {
      seed += v;
      seen++;
      if (seen === n) {
        prev = seed / n;
        out[i] = prev;
      }
      continue;
    }
    prev = prev + k * (v - prev);
    out[i] = prev;
  }
  return out;
}

export function stdev(x: Series, n: number): Series {
  const out = nanArray(x.length);
  for (let i = n - 1; i < x.length; i++) {
    let s = 0;
    let s2 = 0;
    for (let j = i - n + 1; j <= i; j++) {
      s += x[j];
      s2 += x[j] * x[j];
    }
    const m = s / n;
    out[i] = Math.sqrt(Math.max(0, s2 / n - m * m));
  }
  return out;
}

export function rsi(close: Series, n = 14): Series {
  const up = nanArray(close.length);
  const dn = nanArray(close.length);
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    up[i] = Math.max(d, 0);
    dn[i] = Math.max(-d, 0);
  }
  const au = rma(up, n);
  const ad = rma(dn, n);
  return au.map((u, i) => (isFinite(u) && isFinite(ad[i]) ? (ad[i] === 0 ? (u === 0 ? 50 : 100) : 100 - 100 / (1 + u / ad[i])) : NaN));
}

export function macd(close: Series, fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast);
  const s = ema(close, slow);
  const line = f.map((v, i) => v - s[i]);
  const sig = ema(line, signal);
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

export function bollinger(close: Series, n = 20, mult = 2) {
  const mid = sma(close, n);
  const sd = stdev(close, n);
  const upper = mid.map((m, i) => m + mult * sd[i]);
  const lower = mid.map((m, i) => m - mult * sd[i]);
  const pctB = close.map((c, i) => (upper[i] - lower[i] > 0 ? (c - lower[i]) / (upper[i] - lower[i]) : NaN));
  const width = mid.map((m, i) => (m > 0 ? (upper[i] - lower[i]) / m : NaN));
  return { mid, upper, lower, pctB, width };
}

export function trueRange(high: Series, low: Series, close: Series): Series {
  return high.map((h, i) => (i === 0 ? h - low[i] : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1]))));
}

export function atr(high: Series, low: Series, close: Series, n = 14): Series {
  return rma(trueRange(high, low, close), n);
}

/** Wilder's ADX with +DI / −DI. */
export function adx(high: Series, low: Series, close: Series, n = 14) {
  const len = close.length;
  const pdm = nanArray(len);
  const mdm = nanArray(len);
  for (let i = 1; i < len; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    pdm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    mdm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const tr = trueRange(high, low, close);
  tr[0] = NaN;
  const str = rma(tr, n);
  const sp = rma(pdm, n);
  const sm = rma(mdm, n);
  const pdi = sp.map((v, i) => (str[i] > 0 ? (100 * v) / str[i] : NaN));
  const mdi = sm.map((v, i) => (str[i] > 0 ? (100 * v) / str[i] : NaN));
  const dx = pdi.map((p, i) => (p + mdi[i] > 0 ? (100 * Math.abs(p - mdi[i])) / (p + mdi[i]) : isFinite(p) ? 0 : NaN));
  return { adx: rma(dx, n), pdi, mdi };
}

export function highest(x: Series, n: number): Series {
  const out = nanArray(x.length);
  for (let i = n - 1; i < x.length; i++) {
    let m = -Infinity;
    for (let j = i - n + 1; j <= i; j++) if (x[j] > m) m = x[j];
    out[i] = m;
  }
  return out;
}

export function lowest(x: Series, n: number): Series {
  const out = nanArray(x.length);
  for (let i = n - 1; i < x.length; i++) {
    let m = Infinity;
    for (let j = i - n + 1; j <= i; j++) if (x[j] < m) m = x[j];
    out[i] = m;
  }
  return out;
}

/** Slow stochastic %K / %D. */
export function stochastic(high: Series, low: Series, close: Series, n = 14, smoothK = 3, smoothD = 3) {
  const hh = highest(high, n);
  const ll = lowest(low, n);
  const raw = close.map((c, i) => (hh[i] - ll[i] > 0 ? (100 * (c - ll[i])) / (hh[i] - ll[i]) : isFinite(hh[i]) ? 50 : NaN));
  const k = sma(raw, smoothK);
  return { k, d: sma(k, smoothD) };
}

export function cci(high: Series, low: Series, close: Series, n = 20): Series {
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3);
  const m = sma(tp, n);
  const out = nanArray(close.length);
  for (let i = n - 1; i < close.length; i++) {
    let md = 0;
    for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]);
    md /= n;
    out[i] = md > 0 ? (tp[i] - m[i]) / (0.015 * md) : 0;
  }
  return out;
}

export function roc(close: Series, n: number): Series {
  return close.map((c, i) => (i >= n && close[i - n] > 0 ? (c / close[i - n] - 1) * 100 : NaN));
}

export function obv(close: Series, volume: Series): Series {
  const out = new Array<number>(close.length).fill(0);
  for (let i = 1; i < close.length; i++) out[i] = out[i - 1] + (close[i] > close[i - 1] ? volume[i] : close[i] < close[i - 1] ? -volume[i] : 0);
  return out;
}

/** Money Flow Index. */
export function mfi(high: Series, low: Series, close: Series, volume: Series, n = 14): Series {
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3);
  const out = nanArray(close.length);
  for (let i = n; i < close.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j] * volume[j];
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** Chaikin Money Flow. */
export function cmf(high: Series, low: Series, close: Series, volume: Series, n = 20): Series {
  const mfv = close.map((c, i) => {
    const r = high[i] - low[i];
    return r > 0 ? (((c - low[i]) - (high[i] - c)) / r) * volume[i] : 0;
  });
  const a = sma(mfv, n);
  const v = sma(volume, n);
  return a.map((x, i) => (v[i] > 0 ? x / v[i] : NaN));
}

/** Rolling n-day VWAP from daily typical price. */
export function rollingVwap(high: Series, low: Series, close: Series, volume: Series, n = 20): Series {
  const pv = close.map((c, i) => ((high[i] + low[i] + c) / 3) * volume[i]);
  const a = sma(pv, n);
  const v = sma(volume, n);
  return a.map((x, i) => (v[i] > 0 ? x / v[i] : NaN));
}

/** Supertrend (ATR `n`, multiplier `mult`). dir: 1 = up-trend (line below price), −1 = down-trend. */
export function supertrend(high: Series, low: Series, close: Series, n = 10, mult = 3) {
  const a = atr(high, low, close, n);
  const len = close.length;
  const line = nanArray(len);
  const dir = nanArray(len);
  let fu = NaN;
  let fl = NaN;
  let d = 1;
  for (let i = 0; i < len; i++) {
    if (!isFinite(a[i])) continue;
    const hl2 = (high[i] + low[i]) / 2;
    const bu = hl2 + mult * a[i];
    const bl = hl2 - mult * a[i];
    const pc = i > 0 ? close[i - 1] : close[i];
    fu = !isFinite(fu) || bu < fu || pc > fu ? bu : fu;
    fl = !isFinite(fl) || bl > fl || pc < fl ? bl : fl;
    if (isFinite(line[i - 1])) {
      if (d === 1 && close[i] < fl) d = -1;
      else if (d === -1 && close[i] > fu) d = 1;
    }
    dir[i] = d;
    line[i] = d === 1 ? fl : fu;
  }
  return { line, dir };
}

/** Ichimoku. spanA/spanB are aligned to the bar where they were computed; the cloud "now" is spanX[i - displacement]. */
export function ichimoku(high: Series, low: Series, conv = 9, base = 26, spanBLen = 52) {
  const mid = (n: number) => {
    const h = highest(high, n);
    const l = lowest(low, n);
    return h.map((v, i) => (v + l[i]) / 2);
  };
  const tenkan = mid(conv);
  const kijun = mid(base);
  const spanA = tenkan.map((t, i) => (t + kijun[i]) / 2);
  const spanB = mid(spanBLen);
  return { tenkan, kijun, spanA, spanB, displacement: base };
}

/** Least-squares slope of y over the last n points ending at i, plus R². */
export function linreg(y: Series, i: number, n: number): { slope: number; r2: number } | null {
  if (i - n + 1 < 0) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    const v = y[i - n + 1 + k];
    if (!isFinite(v)) return null;
    sx += k;
    sy += v;
    sxx += k * k;
    sxy += k * v;
    syy += v * v;
  }
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const slope = (n * sxy - sx * sy) / den;
  const vy = n * syy - sy * sy;
  const r2 = vy > 0 ? Math.min(1, ((n * sxy - sx * sy) ** 2) / (den * vy)) : 0;
  return { slope, r2 };
}
