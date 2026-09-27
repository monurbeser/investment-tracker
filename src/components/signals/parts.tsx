"use client";
import { REC_LABEL, REC_THRESHOLDS, recOf } from "@/lib/signals/engine";
import type { Rec } from "@/lib/signals/types";
import { fmtPct, fmtPrice } from "@/lib/format";

export const REC_CLASS: Record<Rec, string> = {
  strong_buy: "rec-sbuy",
  buy: "rec-buy",
  hold: "rec-hold",
  sell: "rec-sell",
  strong_sell: "rec-ssell",
};

export function RecBadge({ rec, small }: { rec: Rec; small?: boolean }) {
  return <span className={`rec-badge ${REC_CLASS[rec]}${small ? " sm" : ""}`}>{REC_LABEL[rec]}</span>;
}

// ---------------- gauge ----------------
const ZONES: { from: number; to: number; rec: Rec }[] = [
  { from: -100, to: -REC_THRESHOLDS.strong, rec: "strong_sell" },
  { from: -REC_THRESHOLDS.strong, to: -REC_THRESHOLDS.normal, rec: "sell" },
  { from: -REC_THRESHOLDS.normal, to: REC_THRESHOLDS.normal, rec: "hold" },
  { from: REC_THRESHOLDS.normal, to: REC_THRESHOLDS.strong, rec: "buy" },
  { from: REC_THRESHOLDS.strong, to: 100, rec: "strong_buy" },
];

const ang = (score: number) => Math.PI * (1 - (score + 100) / 200); // −100 → π (left), +100 → 0 (right)

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)];
  const p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)];
  return `M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${r} ${r} 0 0 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
}

/** Semicircular Strong Sell … Strong Buy gauge. */
export function Gauge({ score, size = 260, title, showLabels = true }: { score: number; size?: number; title?: string; showLabels?: boolean }) {
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = size * 0.52;
  const r = size * 0.4;
  const stroke = Math.max(8, size * 0.075);
  const s = Math.max(-100, Math.min(100, score));
  const a = ang(s);
  const needle = [cx + (r - stroke * 0.2) * Math.cos(a), cy - (r - stroke * 0.2) * Math.sin(a)];
  const rec = recOf(s);
  const gap = 0.012;
  return (
    <div className="gauge" style={{ width: w }}>
      {title && <div className="gauge-title">{title}</div>}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title ?? "Öneri"}: ${REC_LABEL[rec]} (skor ${s.toFixed(0)})`}>
        {ZONES.map((z) => (
          <path
            key={z.rec}
            d={arc(cx, cy, r, ang(z.from) - gap, ang(z.to) + gap)}
            className={`gz ${REC_CLASS[z.rec]}${z.rec === rec ? " on" : ""}`}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="butt"
          />
        ))}
        <line x1={cx} y1={cy} x2={needle[0]} y2={needle[1]} className="gauge-needle" strokeWidth={Math.max(2, size * 0.012)} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={Math.max(4, size * 0.025)} className="gauge-hub" />
        {showLabels && (
          <>
            <text x={cx - r} y={cy + stroke * 0.9 + 8} textAnchor="middle" className="gauge-end">
              K. Sat
            </text>
            <text x={cx + r} y={cy + stroke * 0.9 + 8} textAnchor="middle" className="gauge-end">
              K. Al
            </text>
            <text x={cx - r * 0.72} y={cy - r * 0.83} textAnchor="middle" className="gauge-end">
              Sat
            </text>
            <text x={cx} y={cy - r - stroke * 0.85} textAnchor="middle" className="gauge-end">
              Tut
            </text>
            <text x={cx + r * 0.72} y={cy - r * 0.83} textAnchor="middle" className="gauge-end">
              Al
            </text>
          </>
        )}
      </svg>
      <div className={`gauge-rec ${REC_CLASS[rec]}`}>{REC_LABEL[rec]}</div>
      <div className="gauge-score muted small">skor {s > 0 ? "+" : ""}{s.toFixed(0)} / 100</div>
    </div>
  );
}

// ---------------- sparkline ----------------
export function Sparkline({ data, width = 120, height = 34, up }: { data: number[]; width?: number; height?: number; up: boolean }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const k = max - min || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / k) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="spark">
      <polyline points={pts} fill="none" className={up ? "spark-up" : "spark-down"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ---------------- level bar ----------------
/** Horizontal price map: stop, current price and the three targets. */
export function LevelBar({ price, stop, t1, t2, t3, buy }: { price: number; stop: number; t1: number; t2: number; t3: number; buy: boolean }) {
  const pts = [stop, price, t1, t2, t3];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = (hi - lo) * 0.06 || 1;
  const x = (v: number) => ((v - lo + pad) / (hi - lo + 2 * pad)) * 100;
  const marks: { v: number; label: string; cls: string }[] = [
    { v: stop, label: "Stop", cls: "lv-stop" },
    { v: t1, label: "H1", cls: "lv-t" },
    { v: t2, label: "H2", cls: "lv-t main" },
    { v: t3, label: "H3", cls: "lv-t" },
  ];
  return (
    <div className="levelbar" aria-label={`Stop ${fmtPrice(stop)}, fiyat ${fmtPrice(price)}, hedefler ${fmtPrice(t1)} / ${fmtPrice(t2)} / ${fmtPrice(t3)}`}>
      <div className="lv-track">
        <div className={`lv-fill ${buy ? "up" : "down"}`} style={{ left: `${Math.min(x(price), x(t3))}%`, width: `${Math.abs(x(t3) - x(price))}%` }} />
        <div className="lv-risk" style={{ left: `${Math.min(x(price), x(stop))}%`, width: `${Math.abs(x(stop) - x(price))}%` }} />
        {marks.map((m) => (
          <span key={m.label} className={`lv-mark ${m.cls}`} style={{ left: `${x(m.v)}%` }} title={`${m.label}: ${fmtPrice(m.v)} (${fmtPct((m.v / price - 1) * 100)})`} />
        ))}
        <span className="lv-price" style={{ left: `${x(price)}%` }} title={`Fiyat ${fmtPrice(price)}`} />
      </div>
    </div>
  );
}

/** −100…+100 as a small centred bar. */
export function ScoreBar({ value }: { value: number }) {
  const v = Math.max(-100, Math.min(100, value));
  return (
    <span className="scorebar" title={`${v > 0 ? "+" : ""}${v.toFixed(0)}`}>
      <span className={v >= 0 ? "pos" : "neg"} style={v >= 0 ? { left: "50%", width: `${v / 2}%` } : { right: "50%", width: `${-v / 2}%` }} />
    </span>
  );
}

export function StrengthBar({ value }: { value: number }) {
  return (
    <span className="strength" title={`Sinyal kuvveti ${value}/100`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}
