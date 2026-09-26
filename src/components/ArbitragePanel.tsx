"use client";
import { useState } from "react";
import type { ArbitrageResponse } from "@/lib/types";
import { ago, fmtDateTime, fmtPct, fmtPrice, signClass } from "@/lib/format";

interface Props {
  data: ArbitrageResponse | null;
  error: string | null;
  fee: number;
  onFee: (f: number) => void;
  now: number;
}

type Tab = "tri" | "premium" | "fx";

export function ArbitragePanel({ data, error, fee, onFee, now }: Props) {
  const [tab, setTab] = useState<Tab>("premium");
  return (
    <section className="panel arb">
      <header className="panel-head">
        <h2>Arbitraj & döviz fırsatları</h2>
        <span className="muted small">
          {data ? (
            <>
              Çekildi: {fmtDateTime(data.fetchedAt, true)} ({ago(data.fetchedAt, now)})
            </>
          ) : error ? (
            <span className="down">{error}</span>
          ) : (
            "Yükleniyor…"
          )}
        </span>
      </header>
      <div className="tabs inline" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "premium"} className={tab === "premium" ? "on" : ""} onClick={() => setTab("premium")}>
          Kripto-FX primi
        </button>
        <button type="button" role="tab" aria-selected={tab === "tri"} className={tab === "tri" ? "on" : ""} onClick={() => setTab("tri")}>
          Üçgen arbitraj
        </button>
        <button type="button" role="tab" aria-selected={tab === "fx"} className={tab === "fx" ? "on" : ""} onClick={() => setTab("fx")}>
          AED kurları & peg
        </button>
      </div>

      {data && tab === "premium" && (
        <>
          <p className="muted small">Binance’te USDT’nin yerel para karşılığı ile resmi USD kuru arasındaki fark. Pozitif prim: USDT yerel pazarda pahalı (USD getirip USDT satmak kârlı olabilir).</p>
          <table className="perf">
            <thead>
              <tr>
                <th className="left">Para birimi</th>
                <th>Binance</th>
                <th>Resmi kur</th>
                <th>Prim</th>
              </tr>
            </thead>
            <tbody>
              {data.premiums.map((r) => (
                <tr key={r.fiat}>
                  <td className="left">
                    <b>{r.fiat}</b> <span className="muted">{r.binanceSymbol}</span>
                  </td>
                  <td>{fmtPrice(r.binanceRate)}</td>
                  <td>{fmtPrice(r.officialRate)}</td>
                  <td className={`num ${Math.abs(r.premiumPct) > 1 ? "hot" : ""} ${signClass(r.premiumPct)}`}>{fmtPct(r.premiumPct)}</td>
                </tr>
              ))}
              {!data.premiums.length && (
                <tr>
                  <td colSpan={4} className="muted pad">
                    Veri yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {data && tab === "tri" && (
        <>
          <div className="row-between">
            <p className="muted small">Binance en iyi alış/satış fiyatlarıyla USDT → A → B → USDT döngüleri. Net getiri her bacakta işlem ücreti düşülerek hesaplanır.</p>
            <label className="small nowrap">
              Ücret/bacak %
              <input className="mini" type="number" step={0.01} min={0} max={1} value={fee} onChange={(e) => onFee(Math.min(1, Math.max(0, +e.target.value)))} />
            </label>
          </div>
          <table className="perf">
            <thead>
              <tr>
                <th className="left">Döngü</th>
                <th className="left">Pariteler</th>
                <th>Brüt</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {data.triangular.map((r) => (
                <tr key={r.symbols.join()}>
                  <td className="left">
                    <b>{r.path.join(" → ")}</b>
                  </td>
                  <td className="left muted small">{r.symbols.join(" · ")}</td>
                  <td className={signClass(r.grossPct)}>{fmtPct(r.grossPct, 3)}</td>
                  <td className={`num ${r.netPct > 0 ? "hot" : ""} ${signClass(r.netPct)}`}>{fmtPct(r.netPct, 3)}</td>
                </tr>
              ))}
              {!data.triangular.length && (
                <tr>
                  <td colSpan={4} className="muted pad">
                    Veri yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted small">Not: Fırsatlar milisaniyeler içinde kapanır; emir defteri derinliği ve gecikme hesaba katılmamıştır.</p>
        </>
      )}

      {data && tab === "fx" && (
        <>
          <div className="peg">
            <div>
              <span className="muted small">USD/AED resmi peg</span>
              <b>{data.peg.official.toFixed(4)}</b>
            </div>
            <div>
              <span className="muted small">Piyasa</span>
              <b>{data.peg.market != null ? data.peg.market.toFixed(4) : "—"}</b>
            </div>
            <div>
              <span className="muted small">Sapma</span>
              <b className={signClass(data.peg.deviationPct)}>{fmtPct(data.peg.deviationPct, 3)}</b>
            </div>
          </div>
          <table className="perf">
            <thead>
              <tr>
                <th className="left">Parite</th>
                <th>Kur</th>
                <th>Günlük</th>
                <th className="left">Son veri</th>
              </tr>
            </thead>
            <tbody>
              {data.fx.map((r) => (
                <tr key={r.pair}>
                  <td className="left">
                    <b>{r.label}</b>
                  </td>
                  <td>{fmtPrice(r.rate)}</td>
                  <td className={signClass(r.changePct)}>{fmtPct(r.changePct)}</td>
                  <td className="left small muted">{fmtDateTime(r.asOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {data?.errors.length ? <p className="small down">Bazı kaynaklara ulaşılamadı: {data.errors.join(" · ")}</p> : null}
    </section>
  );
}
