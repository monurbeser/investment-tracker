import * as I from "./indicators";
import type { Analysis, Calibration, Group, IndicatorReading, Levels, OhlcvBar, Rec, SignalEvent, SignalRow, TrendRow, VolumeRow } from "./types";

/**
 * Decision engine of the US signal platform.
 *
 * 18 daily indicators (the most used technical toolset in 2026: EMA stack,
 * golden/death cross, MACD, ADX/DMI, Supertrend, Ichimoku, RSI, Stochastic,
 * CCI, 3-month momentum, OBV, CMF, MFI, relative volume, rolling VWAP,
 * Bollinger/squeeze, Donchian breakout, 52-week position) each vote in −1…+1.
 * Votes are averaged into four groups (trend, momentum, volume, volatility)
 * and the groups are blended with ADX-regime weights: trend-following gets
 * more weight when ADX says the stock trends, mean-reversion when it ranges.
 *
 * The composite score (−100…+100) maps to Strong Buy … Strong Sell. The
 * 20-day projection blends a volatility model (score × σ√20) with the stock's
 * own history: the forward 20-day returns observed after similar scores over
 * the last five years.
 */

export const HORIZON = 20;
export const REC_THRESHOLDS = { strong: 45, normal: 15 } as const;

export const REC_LABEL: Record<Rec, string> = {
  strong_buy: "Kuvvetli Al",
  buy: "Al",
  hold: "Tut",
  sell: "Sat",
  strong_sell: "Kuvvetli Sat",
};

export const GROUP_LABEL: Record<Group, string> = {
  trend: "Trend",
  momentum: "Momentum",
  volume: "Hacim",
  volatility: "Volatilite / Yapı",
};

export function recOf(score: number): Rec {
  if (score >= REC_THRESHOLDS.strong) return "strong_buy";
  if (score >= REC_THRESHOLDS.normal) return "buy";
  if (score <= -REC_THRESHOLDS.strong) return "strong_sell";
  if (score <= -REC_THRESHOLDS.normal) return "sell";
  return "hold";
}

const clamp = (v: number, lo = -1, hi = 1) => (isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const fin = (v: number) => isFinite(v);
const f1 = (v: number, d = 1) => (fin(v) ? v.toFixed(d) : "—");

/** All indicator series for a bar list, computed once. */
export interface Frame {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  sma50: number[];
  sma200: number[];
  macd: ReturnType<typeof I.macd>;
  adx: ReturnType<typeof I.adx>;
  st: ReturnType<typeof I.supertrend>;
  ichi: ReturnType<typeof I.ichimoku>;
  rsi: number[];
  stoch: ReturnType<typeof I.stochastic>;
  cci: number[];
  roc63: number[];
  obv: number[];
  obvEma: number[];
  cmf: number[];
  mfi: number[];
  volSma20: number[];
  vwap20: number[];
  bb: ReturnType<typeof I.bollinger>;
  bbWidthLow: number[];
  dcHigh: number[];
  dcLow: number[];
  hi252: number[];
  lo252: number[];
  atr: number[];
  logc: number[];
}

export function buildFrame(bars: OhlcvBar[]): Frame {
  const t = bars.map((b) => b.time);
  const o = bars.map((b) => b.open);
  const h = bars.map((b) => b.high);
  const l = bars.map((b) => b.low);
  const c = bars.map((b) => b.close);
  const v = bars.map((b) => b.volume);
  const bb = I.bollinger(c, 20, 2);
  const obv = I.obv(c, v);
  // Donchian channel of the previous 20 bars (excluding today, so a breakout is detectable).
  const dcH = I.highest(h, 20);
  const dcL = I.lowest(l, 20);
  return {
    t,
    o,
    h,
    l,
    c,
    v,
    ema20: I.ema(c, 20),
    ema50: I.ema(c, 50),
    ema200: I.ema(c, 200),
    sma50: I.sma(c, 50),
    sma200: I.sma(c, 200),
    macd: I.macd(c),
    adx: I.adx(h, l, c, 14),
    st: I.supertrend(h, l, c, 10, 3),
    ichi: I.ichimoku(h, l),
    rsi: I.rsi(c, 14),
    stoch: I.stochastic(h, l, c, 14, 3, 3),
    cci: I.cci(h, l, c, 20),
    roc63: I.roc(c, 63),
    obv,
    obvEma: I.ema(obv, 20),
    cmf: I.cmf(h, l, c, v, 20),
    mfi: I.mfi(h, l, c, v, 14),
    volSma20: I.sma(v, 20),
    vwap20: I.rollingVwap(h, l, c, v, 20),
    bb,
    bbWidthLow: I.lowest(bb.width, 120),
    dcHigh: [NaN, ...dcH.slice(0, -1)],
    dcLow: [NaN, ...dcL.slice(0, -1)],
    hi252: I.highest(h, 252),
    lo252: I.lowest(l, 252),
    atr: I.atr(h, l, c, 14),
    logc: c.map((x) => Math.log(x)),
  };
}

interface Vote {
  key: string;
  label: string;
  group: Group;
  signal: number;
  value: string;
  note: string;
}

/** Indicator votes at bar i. */
export function votesAt(f: Frame, i: number): Vote[] {
  const c = f.c[i];
  const out: Vote[] = [];
  const add = (key: string, label: string, group: Group, signal: number, value: string, note: string) =>
    out.push({ key, label, group, signal: clamp(signal), value, note });

  // ---- trend ----
  const e20 = f.ema20[i];
  const e50 = f.ema50[i];
  const e200 = f.ema200[i];
  if (fin(e50)) {
    const parts = [sign(c - e20), sign(e20 - e50), fin(e200) ? sign(e50 - e200) : 0, fin(e200) ? sign(c - e200) : 0];
    const s = parts.reduce((a, b) => a + b, 0) / (fin(e200) ? 4 : 2);
    const note = s >= 0.99 ? "Fiyat > EMA20 > EMA50 > EMA200 (tam yükseliş dizilimi)" : s <= -0.99 ? "Fiyat < EMA20 < EMA50 < EMA200 (tam düşüş dizilimi)" : "Karışık hareketli ortalama dizilimi";
    add("ema", "EMA 20/50/200", "trend", s, `EMA20 ${f1(e20, 2)} · EMA50 ${f1(e50, 2)} · EMA200 ${f1(e200, 2)}`, note);
  }
  const s50 = f.sma50[i];
  const s200 = f.sma200[i];
  if (fin(s200)) {
    const dir = sign(s50 - s200);
    let fresh = 0;
    for (let k = i - 1; k >= Math.max(1, i - 20); k--) {
      if (sign(f.sma50[k] - f.sma200[k]) !== dir) {
        fresh = 1;
        break;
      }
    }
    add(
      "cross",
      "SMA 50/200 (Golden/Death Cross)",
      "trend",
      dir * (fresh ? 1 : 0.6),
      `SMA50 ${f1(s50, 2)} / SMA200 ${f1(s200, 2)}`,
      dir > 0 ? (fresh ? "Yeni Golden Cross (son 20 gün)" : "SMA50 SMA200 üzerinde") : fresh ? "Yeni Death Cross (son 20 gün)" : "SMA50 SMA200 altında",
    );
  }
  const ml = f.macd.line[i];
  const ms = f.macd.signal[i];
  const mh = f.macd.hist[i];
  if (fin(ms) && fin(f.macd.hist[i - 1])) {
    const rising = mh > f.macd.hist[i - 1];
    const s = (ml > ms ? 0.5 : -0.5) + (ml > 0 ? 0.25 : -0.25) + (rising ? 0.25 : -0.25);
    add("macd", "MACD (12,26,9)", "trend", s, `MACD ${f1(ml, 2)} · Sinyal ${f1(ms, 2)} · Hist ${f1(mh, 2)}`, `${ml > ms ? "MACD sinyal üzerinde" : "MACD sinyal altında"}, histogram ${rising ? "artıyor" : "azalıyor"}`);
  }
  const ax = f.adx.adx[i];
  const pdi = f.adx.pdi[i];
  const mdi = f.adx.mdi[i];
  if (fin(ax)) {
    const strength = clamp((ax - 15) / 20, 0, 1);
    add("adx", "ADX / DMI (14)", "trend", sign(pdi - mdi) * strength, `ADX ${f1(ax)} · +DI ${f1(pdi)} · −DI ${f1(mdi)}`, `${ax >= 25 ? "Güçlü trend" : ax >= 18 ? "Gelişen trend" : "Trend yok (yatay)"}, ${pdi > mdi ? "alıcılar baskın" : "satıcılar baskın"}`);
  }
  const sd = f.st.dir[i];
  if (fin(sd)) {
    let age = 0;
    while (i - age - 1 >= 0 && f.st.dir[i - age - 1] === sd) age++;
    add("supertrend", "Supertrend (10,3)", "trend", sd, `Çizgi ${f1(f.st.line[i], 2)}`, `${sd > 0 ? "Yükseliş" : "Düşüş"} modu, ${age + 1} gündür`);
  }
  const d = f.ichi.displacement;
  if (i - d >= 0 && fin(f.ichi.spanB[i - d])) {
    const top = Math.max(f.ichi.spanA[i - d], f.ichi.spanB[i - d]);
    const bot = Math.min(f.ichi.spanA[i - d], f.ichi.spanB[i - d]);
    const cloud = c > top ? 1 : c < bot ? -1 : 0;
    const tk = sign(f.ichi.tenkan[i] - f.ichi.kijun[i]);
    add("ichimoku", "Ichimoku Bulutu", "trend", 0.65 * cloud + 0.35 * tk, `Bulut ${f1(bot, 2)}–${f1(top, 2)}`, `${cloud > 0 ? "Fiyat bulutun üstünde" : cloud < 0 ? "Fiyat bulutun altında" : "Fiyat bulutun içinde"}; Tenkan ${tk > 0 ? ">" : "<"} Kijun`);
  }

  // ---- momentum ----
  const r = f.rsi[i];
  if (fin(r) && fin(f.rsi[i - 1])) {
    const rising = r > f.rsi[i - 1];
    let s = clamp((r - 50) / 15) * 0.6;
    let note = r >= 50 ? "Pozitif momentum bölgesi" : "Negatif momentum bölgesi";
    if (r >= 70) {
      s = rising ? 0.1 : -0.3 - (r - 70) / 20;
      note = "Aşırı alım";
    } else if (r <= 30) {
      s = rising ? 0.3 + (30 - r) / 20 : -0.1;
      note = "Aşırı satım";
    }
    add("rsi", "RSI (14)", "momentum", s, `RSI ${f1(r)}`, `${note}, ${rising ? "yükseliyor" : "düşüyor"}`);
  }
  const k = f.stoch.k[i];
  const sdv = f.stoch.d[i];
  if (fin(sdv)) {
    let s = sign(k - sdv) * 0.4;
    let note = k > sdv ? "%K %D üzerinde" : "%K %D altında";
    if (k < 20 && k > sdv) (s = 1), (note = "Aşırı satımdan yukarı kesişim");
    else if (k > 80 && k < sdv) (s = -1), (note = "Aşırı alımdan aşağı kesişim");
    add("stoch", "Stokastik (14,3,3)", "momentum", s, `%K ${f1(k)} · %D ${f1(sdv)}`, note);
  }
  const cc = f.cci[i];
  if (fin(cc) && fin(f.cci[i - 1])) {
    const rising = cc > f.cci[i - 1];
    let s = clamp(cc / 200) * 0.5;
    if (cc < -100 && rising) s = 0.8;
    if (cc > 100 && !rising) s = -0.6;
    add("cci", "CCI (20)", "momentum", s, `CCI ${f1(cc, 0)}`, cc > 100 ? "Güçlü yukarı sapma" : cc < -100 ? "Güçlü aşağı sapma" : "Normal bant");
  }
  const m3 = f.roc63[i];
  if (fin(m3)) add("roc", "3 Aylık Momentum (ROC 63)", "momentum", clamp(m3 / 25), `${f1(m3)}%`, m3 > 0 ? "Son 3 ayda pozitif getiri" : "Son 3 ayda negatif getiri");

  // ---- volume ----
  if (i >= 25 && fin(f.obvEma[i])) {
    const above = sign(f.obv[i] - f.obvEma[i]);
    const slope = sign(f.obv[i] - f.obv[i - 10]);
    add("obv", "OBV (On-Balance Volume)", "volume", 0.6 * above + 0.4 * slope, above > 0 ? "OBV > EMA20" : "OBV < EMA20", slope > 0 ? "Hacim birikimi (akümülasyon)" : "Hacim dağıtımı (distribüsyon)");
  }
  const cm = f.cmf[i];
  if (fin(cm)) add("cmf", "Chaikin Money Flow (20)", "volume", clamp(cm / 0.2), `CMF ${f1(cm, 3)}`, cm > 0.05 ? "Para girişi" : cm < -0.05 ? "Para çıkışı" : "Dengeli para akışı");
  const mf = f.mfi[i];
  if (fin(mf)) {
    let s = clamp((mf - 50) / 25) * 0.6;
    if (mf >= 80) s = -0.6;
    if (mf <= 20) s = 0.6;
    add("mfi", "Money Flow Index (14)", "volume", s, `MFI ${f1(mf)}`, mf >= 80 ? "Hacimli aşırı alım" : mf <= 20 ? "Hacimli aşırı satım" : mf >= 50 ? "Pozitif hacim akışı" : "Negatif hacim akışı");
  }
  const vs = f.volSma20[i];
  if (fin(vs) && vs > 0 && i > 0) {
    const rv = f.v[i] / vs;
    const move = sign(c - f.c[i - 1]);
    const s = rv > 1.3 ? move * clamp((rv - 1) / 1.5, 0, 1) : 0;
    add("rvol", "Göreli Hacim (RVOL 20)", "volume", s, `${f1(rv, 2)}×`, rv > 1.3 ? `Ortalamanın üstünde hacimle ${move > 0 ? "yükseliş" : move < 0 ? "düşüş" : "yatay kapanış"}` : "Normal hacim");
  }
  const vw = f.vwap20[i];
  if (fin(vw) && fin(f.atr[i]) && f.atr[i] > 0) {
    add("vwap", "VWAP (20 gün)", "volume", sign(c - vw) * clamp(Math.abs(c - vw) / f.atr[i], 0, 1), `VWAP ${f1(vw, 2)}`, c > vw ? "Fiyat hacim ağırlıklı ortalamanın üzerinde" : "Fiyat hacim ağırlıklı ortalamanın altında");
  }

  // ---- volatility / structure ----
  const pb = f.bb.pctB[i];
  if (fin(pb)) {
    const squeeze = fin(f.bbWidthLow[i - 1]) && f.bb.width[i - 1] <= f.bbWidthLow[i - 1] * 1.1;
    let s = clamp((0.5 - pb) * 1.2) * 0.6;
    let note = pb > 1 ? "Üst bandın dışında (gerilmiş)" : pb < 0 ? "Alt bandın dışında (gerilmiş)" : "Bant içinde";
    if (squeeze && pb > 1) (s = 1), (note = "Sıkışma sonrası yukarı kırılım");
    else if (squeeze && pb < 0) (s = -1), (note = "Sıkışma sonrası aşağı kırılım");
    else if (squeeze) note = "Bollinger sıkışması (kırılım bekleniyor)";
    add("bb", "Bollinger Bantları (20,2)", "volatility", s, `%B ${f1(pb, 2)} · Genişlik ${f1(f.bb.width[i] * 100)}%`, note);
  }
  const dh = f.dcHigh[i];
  const dl = f.dcLow[i];
  if (fin(dh) && fin(dl)) {
    const s = c > dh ? 1 : c < dl ? -1 : clamp((c - (dh + dl) / 2) / ((dh - dl) / 2 || 1)) * 0.3;
    add("donchian", "Donchian Kanalı (20)", "volatility", s, `${f1(dl, 2)}–${f1(dh, 2)}`, c > dh ? "20 günlük zirve kırıldı" : c < dl ? "20 günlük dip kırıldı" : "Kanal içinde");
  }
  const h52 = f.hi252[i];
  const l52 = f.lo252[i];
  if (fin(h52) && fin(l52) && h52 > l52) {
    const pos = (c - l52) / (h52 - l52);
    const s = pos >= 0.9 ? 0.7 : pos <= 0.1 ? -0.7 : (pos - 0.5) * 0.6;
    add("52w", "52 Haftalık Konum", "volatility", s, `${f1(pos * 100, 0)}% (${f1(l52, 2)}–${f1(h52, 2)})`, pos >= 0.9 ? "52 haftalık zirveye yakın (güç)" : pos <= 0.1 ? "52 haftalık dibe yakın (zayıflık)" : "Aralığın ortasında");
  }
  return out;
}

export interface ScoreParts {
  score: number;
  groups: Record<Group, number>;
  trendiness: number;
  agreement: number;
}

const GROUPS: Group[] = ["trend", "momentum", "volume", "volatility"];

export function scoreVotes(votes: Vote[], adxValue: number): ScoreParts {
  const groups = { trend: 0, momentum: 0, volume: 0, volatility: 0 } as Record<Group, number>;
  for (const g of GROUPS) {
    const vs = votes.filter((v) => v.group === g);
    groups[g] = vs.length ? (vs.reduce((a, v) => a + v.signal, 0) / vs.length) * 100 : 0;
  }
  const trendiness = clamp(((isFinite(adxValue) ? adxValue : 20) - 18) / 12, 0, 1);
  const w = {
    trend: 0.3 + 0.12 * trendiness,
    momentum: 0.28 - 0.04 * trendiness,
    volume: 0.2,
    volatility: 0.22 - 0.08 * trendiness,
  };
  const score = GROUPS.reduce((a, g) => a + groups[g] * w[g], 0);
  const dir = sign(score);
  const agreement = votes.length && dir ? votes.filter((v) => sign(v.signal) === dir).length / votes.length : 0;
  return { score, groups, trendiness, agreement };
}

export function scoreAt(f: Frame, i: number): ScoreParts {
  return scoreVotes(votesAt(f, i), f.adx.adx[i]);
}

/** Minimum history for a meaningful score (EMA200 + a little). */
export const MIN_BARS = 220;

function logReturnsStdev(c: number[], i: number, n: number): number {
  const rs: number[] = [];
  for (let k = Math.max(1, i - n + 1); k <= i; k++) rs.push(Math.log(c[k] / c[k - 1]));
  if (rs.length < 5) return NaN;
  const m = rs.reduce((a, b) => a + b, 0) / rs.length;
  return Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Swing highs/lows (fractal pivots with `k` bars each side) in the last `lookback` bars. */
function pivots(f: Frame, i: number, lookback = 250, k = 5) {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let j = Math.max(k, i - lookback); j <= i - k; j++) {
    let isH = true;
    let isL = true;
    for (let m = 1; m <= k && (isH || isL); m++) {
      if (f.h[j] < f.h[j - m] || f.h[j] < f.h[j + m]) isH = false;
      if (f.l[j] > f.l[j - m] || f.l[j] > f.l[j + m]) isL = false;
    }
    if (isH) highs.push(f.h[j]);
    if (isL) lows.push(f.l[j]);
  }
  return { highs, lows };
}

function cluster(levels: number[], tol: number): number[] {
  const s = [...levels].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) {
    if (out.length && Math.abs(x - out[out.length - 1]) / x < tol) out[out.length - 1] = (out[out.length - 1] + x) / 2;
    else out.push(x);
  }
  return out;
}

/**
 * Historical calibration: for every past day with a score close to today's
 * (same direction, within ±12 points), collect the forward return over
 * HORIZON bars.
 */
export function calibrate(f: Frame, scores: number[], i: number, score: number): Calibration {
  const fwd: number[] = [];
  const all: number[] = [];
  const dir = sign(Math.abs(score) < REC_THRESHOLDS.normal ? 0 : score);
  for (let j = MIN_BARS; j + HORIZON <= i; j++) {
    const s = scores[j];
    if (!isFinite(s)) continue;
    const r = (f.c[j + HORIZON] / f.c[j] - 1) * 100;
    all.push(r);
    if (Math.abs(s - score) <= 12 && sign(s) === sign(score)) fwd.push(r);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    samples: fwd.length,
    hitRate: fwd.length && dir ? fwd.filter((r) => sign(r) === dir).length / fwd.length : null,
    avgFwdPct: avg(fwd),
    medianFwdPct: median(fwd),
    baseFwdPct: avg(all),
  };
}

function projectLevels(f: Frame, i: number, score: number, cal: Calibration): Levels {
  const price = f.c[i];
  const atrV = f.atr[i];
  const sigma = logReturnsStdev(f.c, i, 60);
  const move = sigma * Math.sqrt(HORIZON) * 100; // 1σ move over the horizon, %
  const rec = recOf(score);
  const dir = rec === "hold" ? 0 : sign(score);

  // Model: stronger scores → a larger share of the 1σ horizon move.
  const model = (score / 100) * move * 1.1;
  let expected = model;
  if (cal.samples >= 20 && cal.avgFwdPct != null) {
    const w = cal.samples / (cal.samples + 80);
    const blended = (1 - w) * model + w * cal.avgFwdPct;
    // History pointing the other way weakens but never flips the call.
    expected = dir && sign(blended) !== dir ? model * 0.35 : blended;
  }
  if (!dir) expected = model;

  const { highs, lows } = pivots(f, i);
  const resistances = cluster(highs.filter((x) => x > price * 1.005), 0.012).slice(0, 4);
  const supports = cluster(lows.filter((x) => x < price * 0.995), 0.012).reverse().slice(0, 4);
  if (isFinite(f.hi252[i]) && f.hi252[i] > price * 1.005 && !resistances.some((r) => Math.abs(r / f.hi252[i] - 1) < 0.01)) resistances.push(f.hi252[i]);
  if (isFinite(f.sma200[i])) (f.sma200[i] > price ? resistances : supports).push(f.sma200[i]);
  resistances.sort((a, b) => a - b);
  supports.sort((a, b) => b - a);

  const targetPrice = price * (1 + expected / 100);
  let t1: number;
  let t2: number;
  let t3: number;
  let stop: number;
  const stLine = f.st.line[i];
  if (dir >= 0) {
    const up = Math.max(Math.abs(expected), 0.5);
    t1 = price * (1 + (up * 0.5) / 100);
    t2 = dir > 0 ? targetPrice : price * (1 + up / 100);
    const res = resistances.find((r) => r > t2 * 1.01);
    t3 = Math.max(price * (1 + (up * 1.7) / 100), res && res < price * (1 + (up * 3) / 100) ? res : 0);
    const atrStop = price - 2 * atrV;
    stop = isFinite(stLine) && stLine < price && stLine > atrStop ? stLine : atrStop;
  } else {
    const dn = Math.abs(expected);
    t1 = price * (1 - (dn * 0.5) / 100);
    t2 = targetPrice;
    const sup = supports.find((s) => s < t2 * 0.99);
    t3 = Math.min(price * (1 - (dn * 1.7) / 100), sup && sup > price * (1 - (dn * 3) / 100) ? sup : Infinity);
    const atrStop = price + 2 * atrV;
    stop = isFinite(stLine) && stLine > price && stLine < atrStop ? stLine : atrStop;
  }
  const risk = Math.abs(price - stop);
  return {
    price,
    atr: atrV,
    atrPct: (atrV / price) * 100,
    volPct: sigma * 100,
    horizonDays: HORIZON,
    expectedPct: expected,
    targetPrice,
    t1,
    t2,
    t3,
    stop,
    riskReward: risk > 0 ? Math.abs(t2 - price) / risk : null,
    supports: supports.slice(0, 4),
    resistances: resistances.slice(0, 4),
  };
}

const DAY = 86400;

function volumeStats(f: Frame, i: number): VolumeRow[] {
  const nowT = f.t[i];
  const yStart = Date.UTC(new Date(nowT * 1000).getUTCFullYear(), 0, 1) / 1000;
  let ytdBars = 0;
  for (let j = i; j >= 0 && f.t[j] >= yStart; j--) ytdBars++;
  const spans: [VolumeRow["key"], string, number][] = [
    ["1D", "Günlük (son seans)", 1],
    ["1W", "Haftalık (5 seans)", 5],
    ["1M", "Aylık (21 seans)", 21],
    ["YTD", "Yılbaşından beri", ytdBars],
    ["1Y", "1 Yıl (252 seans)", 252],
    ["5Y", "5 Yıl", Math.min(i + 1, 1260)],
  ];
  const avgOver = (n: number) => {
    if (n <= 0 || i - n + 1 < 0) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += f.v[j];
    return s / n;
  };
  const y1 = avgOver(Math.min(252, i + 1));
  return spans.map(([key, label, n]) => {
    const ok = n > 0 && i - n + 1 >= 0;
    let vol = 0;
    let dv = 0;
    if (ok) for (let j = i - n + 1; j <= i; j++) (vol += f.v[j]), (dv += f.v[j] * f.c[j]);
    const base = key === "1D" ? f.c[i - 1] : ok && i - n >= 0 ? f.c[i - n] : ok ? f.o[i - n + 1] : NaN;
    return {
      key,
      label,
      bars: ok ? n : 0,
      avgVolume: ok ? vol / n : null,
      avgDollarVolume: ok ? dv / n : null,
      totalVolume: ok ? vol : null,
      vs1Y: ok && y1 ? vol / n / y1 : null,
      returnPct: isFinite(base) && base > 0 ? (f.c[i] / base - 1) * 100 : null,
    };
  });
}

function trendRows(f: Frame, i: number): TrendRow[] {
  const spec: [TrendRow["key"], string, number, number[]][] = [
    ["short", "Kısa vade (20 gün)", 20, f.ema20],
    ["mid", "Orta vade (60 gün)", 60, f.sma50],
    ["long", "Uzun vade (200 gün)", 200, f.sma200],
  ];
  return spec.map(([key, label, n, ma]) => {
    const lr = I.linreg(f.logc, i, n);
    const slopePct = lr ? (Math.exp(lr.slope * 252) - 1) * 100 : null;
    const vsMa = isFinite(ma[i]) ? (f.c[i] / ma[i] - 1) * 100 : null;
    let dir: TrendRow["dir"] = 0;
    if (slopePct != null && lr) {
      const firm = lr.r2 >= 0.5;
      if (slopePct > 25 && firm) dir = 2;
      else if (slopePct > 5) dir = 1;
      else if (slopePct < -25 && firm) dir = -2;
      else if (slopePct < -5) dir = -1;
    }
    const names = { 2: "Güçlü yükseliş", 1: "Yükseliş", 0: "Yatay", [-1]: "Düşüş", [-2]: "Güçlü düşüş" } as Record<number, string>;
    return { key, label, bars: n, slopePct, r2: lr?.r2 ?? null, vsMaPct: vsMa, label2: names[dir], dir };
  });
}

/** Full analysis of the last bar. Returns null when there is not enough history. */
export function analyze(bars: OhlcvBar[]): Analysis | null {
  if (bars.length < MIN_BARS) return null;
  const f = buildFrame(bars);
  const i = bars.length - 1;
  const scores: number[] = new Array<number>(bars.length).fill(NaN);
  for (let j = MIN_BARS; j <= i; j++) scores[j] = scoreAt(f, j).score;

  const votes = votesAt(f, i);
  const parts = scoreVotes(votes, f.adx.adx[i]);
  const score = parts.score;
  const rec = recOf(score);
  const cal = calibrate(f, scores, i, score);
  const levels = projectLevels(f, i, score, cal);

  // Strength: magnitude, agreement among indicators, and historical hit rate.
  const hit = cal.hitRate != null && cal.samples >= 20 ? cal.hitRate : 0.5;
  const strength = Math.round(clamp(Math.abs(score) / 70, 0, 1) * 55 + parts.agreement * 30 + clamp((hit - 0.4) / 0.3, 0, 1) * 15);

  // Rec transitions (entering buy / sell zones) over the last year.
  const events: SignalEvent[] = [];
  for (let j = Math.max(MIN_BARS + 1, i - 260); j <= i; j++) {
    const a = recOf(scores[j - 1]);
    const b = recOf(scores[j]);
    const wasBuy = a === "buy" || a === "strong_buy";
    const isBuy = b === "buy" || b === "strong_buy";
    const wasSell = a === "sell" || a === "strong_sell";
    const isSell = b === "sell" || b === "strong_sell";
    if (isBuy && !wasBuy) events.push({ time: f.t[j], kind: "buy", score: scores[j] });
    else if (isSell && !wasSell) events.push({ time: f.t[j], kind: "sell", score: scores[j] });
  }
  const scoreHistory: { time: number; value: number }[] = [];
  for (let j = Math.max(MIN_BARS, i - 260); j <= i; j++) scoreHistory.push({ time: f.t[j], value: +scores[j].toFixed(1) });

  const readings: IndicatorReading[] = votes.map((v) => ({ key: v.key, label: v.label, group: v.group, value: v.value, signal: +v.signal.toFixed(2), note: v.note }));
  const vs = f.volSma20[i];
  return {
    asOf: f.t[i],
    price: f.c[i],
    changePct: i > 0 ? (f.c[i] / f.c[i - 1] - 1) * 100 : null,
    score: +score.toFixed(1),
    rec,
    strength,
    groups: parts.groups,
    trendiness: parts.trendiness,
    readings,
    levels,
    calibration: cal,
    volume: volumeStats(f, i),
    rvol: isFinite(vs) && vs > 0 ? f.v[i] / vs : null,
    trend: trendRows(f, i),
    events,
    scoreHistory,
  };
}

export function toRow(meta: { symbol: string; name: string; exchange: string; sector?: string; marketCap?: number | null }, bars: OhlcvBar[], a: Analysis): SignalRow {
  const r4 = (v: number) => +v.toPrecision(6);
  return {
    ...meta,
    price: r4(a.price),
    changePct: a.changePct != null ? +a.changePct.toFixed(2) : null,
    score: a.score,
    rec: a.rec,
    strength: a.strength,
    expectedPct: +a.levels.expectedPct.toFixed(2),
    targetPrice: r4(a.levels.targetPrice),
    t1: r4(a.levels.t1),
    t2: r4(a.levels.t2),
    t3: r4(a.levels.t3),
    stop: r4(a.levels.stop),
    hitRate: a.calibration.samples >= 20 ? a.calibration.hitRate : null,
    rvol: a.rvol != null ? +a.rvol.toFixed(2) : null,
    avgDollarVolume: a.volume.find((v) => v.key === "1M")?.avgDollarVolume ?? null,
    trend: a.trend.find((t) => t.key === "mid")?.dir ?? 0,
    groups: { trend: Math.round(a.groups.trend), momentum: Math.round(a.groups.momentum), volume: Math.round(a.groups.volume), volatility: Math.round(a.groups.volatility) },
    spark: bars.slice(-60).map((b) => r4(b.close)),
    asOf: a.asOf,
  };
}

/** Liquidity filter for the top-10 lists. */
export const MIN_DOLLAR_VOLUME = 10_000_000;
export const MIN_PRICE = 3;

export function rankSignals(rows: SignalRow[], n = 10): { buys: SignalRow[]; sells: SignalRow[] } {
  const liquid = rows.filter((r) => (r.avgDollarVolume ?? 0) >= MIN_DOLLAR_VOLUME && r.price >= MIN_PRICE);
  // Rank by a blend of score and strength so a strong but contested score does not win alone.
  const key = (r: SignalRow) => Math.abs(r.score) * 0.6 + r.strength * 0.4;
  const buys = liquid.filter((r) => r.rec === "buy" || r.rec === "strong_buy").sort((a, b) => key(b) - key(a));
  const sells = liquid.filter((r) => r.rec === "sell" || r.rec === "strong_sell").sort((a, b) => key(b) - key(a));
  return { buys: buys.slice(0, n), sells: sells.slice(0, n) };
}
