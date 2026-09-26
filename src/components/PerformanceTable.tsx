"use client";
import type { Instrument, Period, Quote } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodReturn } from "@/lib/perf";
import { mergeLive } from "@/lib/live";
import { ago, fmtDateTime, fmtPct, fmtPrice, signClass } from "@/lib/format";
import type { HistoryEntry } from "@/lib/client/useHistories";

interface Props {
  instruments: Instrument[];
  histories: Record<string, HistoryEntry>;
  quotes: Record<string, Quote>;
  colors: Record<string, string>;
  usd: boolean;
  period: Period;
  onPeriod: (p: Period) => void;
  now: number;
}

function heat(v: number | null | undefined): React.CSSProperties | undefined {
  if (v == null || !isFinite(v)) return undefined;
  const a = Math.min(0.35, Math.abs(v) / 60 + 0.04);
  return { background: v >= 0 ? `rgba(38,166,154,${a})` : `rgba(239,83,80,${a})` };
}

export function PerformanceTable({ instruments, histories, quotes, colors, usd, period, onPeriod, now }: Props) {
  const nowSec = Math.floor(now / 1000);
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Performans karşılaştırması</h2>
        <span className="muted small">{usd ? "USD bazında" : "Yerel para biriminde"} · fiyat getirisi · son fiyat canlı kotasyonla güncellenir</span>
      </header>
      <div className="table-wrap">
        <table className="perf">
          <thead>
            <tr>
              <th className="left">Enstrüman</th>
              <th>Son fiyat</th>
              {PERIODS.map((p) => (
                <th key={p}>
                  <button type="button" className={`th-btn ${p === period ? "on" : ""}`} onClick={() => onPeriod(p)}>
                    {PERIOD_LABELS[p]}
                  </button>
                </th>
              ))}
              <th className="left">Son veri / kaynak</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((i) => {
              const h = histories[i.id];
              const q = quotes[i.id];
              const bars = h?.data ? mergeLive(usd ? h.data.usd : h.data.bars, i.source === "bond" ? undefined : q, "daily", usd) : [];
              const latest = q?.asOf && h?.data?.lastDataAt ? (q.asOf > h.data.lastDataAt ? q.asOf : h.data.lastDataAt) : (q?.asOf ?? h?.data?.lastDataAt ?? null);
              return (
                <tr key={i.id}>
                  <td className="left">
                    <span className="dot" style={{ background: colors[i.id], borderColor: colors[i.id] }} />
                    <b>{i.symbol.replace(/USDT$/, "")}</b> <span className="muted">{i.name}</span>
                  </td>
                  <td>{q ? fmtPrice(usd ? q.priceUsd : q.price, usd ? "USD" : q.currency) : "—"}</td>
                  {PERIODS.map((p) => {
                    const r = bars.length ? periodReturn(bars, p, nowSec) : null;
                    return (
                      <td key={p} className={`num ${signClass(r?.pct)} ${p === period ? "col-on" : ""}`} style={heat(r?.pct)}>
                        {h?.loading && !h.data ? "…" : r ? fmtPct(r.pct) : "—"}
                      </td>
                    );
                  })}
                  <td className="left small">
                    {h?.error && !h.data ? (
                      <span className="down" title={h.error}>
                        Veri alınamadı: {h.error}
                      </span>
                    ) : (
                      <>
                        <span title={fmtDateTime(latest, true)}>{fmtDateTime(latest)}</span> <span className="muted">({ago(latest, now)})</span>
                        <br />
                        <span className="muted">{q?.source === "Binance WS" ? "Binance WebSocket (canlı)" : (h?.data?.source ?? q?.source ?? "")}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!instruments.length && (
              <tr>
                <td colSpan={PERIODS.length + 3} className="muted pad">
                  Soldaki listeden enstrüman seçin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
