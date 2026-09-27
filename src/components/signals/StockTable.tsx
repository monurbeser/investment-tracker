"use client";
import { useEffect, useMemo, useState } from "react";
import type { Rec, SignalRow, SignalScan, StockSearchHit } from "@/lib/signals/types";
import { REC_LABEL } from "@/lib/signals/engine";
import { fmtCompact, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { searchStocks } from "@/lib/client/signalsApi";
import { STATIC } from "@/lib/client/api";
import { RecBadge, ScoreBar, Sparkline } from "./parts";

type SortKey = "symbol" | "price" | "changePct" | "score" | "strength" | "expectedPct" | "rvol" | "avgDollarVolume" | "marketCap";
const RECS: (Rec | "all")[] = ["all", "strong_buy", "buy", "hold", "sell", "strong_sell"];

export function StockTable({ scan, selected, onSelect }: { scan: SignalScan; selected: string | null; onSelect: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [rec, setRec] = useState<Rec | "all">("all");
  const [ex, setEx] = useState("all");
  const [sector, setSector] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [limit, setLimit] = useState(40);
  const [remote, setRemote] = useState<StockSearchHit[]>([]);

  const exchanges = useMemo(() => [...new Set(scan.rows.map((r) => r.exchange))].sort(), [scan]);
  const sectors = useMemo(() => [...new Set(scan.rows.map((r) => r.sector).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "tr")), [scan]);

  const rows = useMemo(() => {
    const Q = q.trim().toUpperCase();
    const list = scan.rows.filter(
      (r) =>
        (rec === "all" || r.rec === rec) &&
        (ex === "all" || r.exchange === ex) &&
        (sector === "all" || r.sector === sector) &&
        (!Q || r.symbol.startsWith(Q) || r.name.toUpperCase().includes(Q)),
    );
    const k = sort.key;
    return list.sort((a, b) => {
      if (k === "symbol") return a.symbol.localeCompare(b.symbol) * sort.dir;
      const va = (a[k] as number | null | undefined) ?? -Infinity;
      const vb = (b[k] as number | null | undefined) ?? -Infinity;
      return (va - vb) * sort.dir;
    });
  }, [scan, q, rec, ex, sector, sort]);

  // Tickers outside the scanned universe (server mode: any US listing via Yahoo search).
  useEffect(() => {
    const Q = q.trim();
    if (STATIC || Q.length < 1) return setRemote([]);
    const t = setTimeout(() => {
      searchStocks(Q, scan).then((hits) => setRemote(hits.filter((h) => !scan.rows.some((r) => r.symbol === h.symbol)).slice(0, 8)));
    }, 300);
    return () => clearTimeout(t);
  }, [q, scan]);

  const th = (key: SortKey, label: string, title?: string) => (
    <th title={title}>
      <button type="button" className={`th-btn ${sort.key === key ? "on" : ""}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "symbol" ? 1 : -1 }))}>
        {label}
        {sort.key === key ? (sort.dir < 0 ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  return (
    <section className="panel" id="stock-list">
      <div className="panel-head">
        <h2>Tüm hisseler ({scan.rows.length})</h2>
        <span className="muted small">Bir satıra tıklayın → grafik ve durum ekranı açılır</span>
      </div>
      <div className="st-filters">
        <input type="search" placeholder={STATIC ? "Sembol veya şirket ara…" : "Sembol veya şirket ara (tüm ABD borsaları)…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hisse ara" />
        <div className="tabs inline">
          {RECS.map((r) => (
            <button key={r} type="button" className={rec === r ? "on" : ""} onClick={() => setRec(r)}>
              {r === "all" ? "Tümü" : REC_LABEL[r]}
            </button>
          ))}
        </div>
        <select value={ex} onChange={(e) => setEx(e.target.value)} aria-label="Borsa">
          <option value="all">Tüm borsalar</option>
          {exchanges.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sektör">
          <option value="all">Tüm sektörler</option>
          {sectors.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {remote.length > 0 && (
        <div className="remote-hits">
          <span className="muted small">Tarama dışı ABD hisseleri:</span>
          {remote.map((h) => (
            <button key={h.symbol} type="button" className="chip" onClick={() => onSelect(h.symbol)} title={`${h.name} · ${h.exchange}`}>
              <b>{h.symbol}</b>&nbsp;<span className="muted">{h.exchange}</span>
            </button>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="perf stocks">
          <thead>
            <tr>
              {th("symbol", "Sembol")}
              <th className="left">Şirket / borsa</th>
              {th("price", "Fiyat")}
              {th("changePct", "Gün %")}
              <th>60 gün</th>
              {th("score", "Skor", "−100 (kuvvetli sat) … +100 (kuvvetli al)")}
              <th className="left">Öneri</th>
              {th("strength", "Kuvvet")}
              {th("expectedPct", "Tahmin (20g)")}
              {th("rvol", "RVOL")}
              {th("avgDollarVolume", "$ Hacim/gün")}
              {th("marketCap", "Piy. değeri")}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r: SignalRow) => (
              <tr key={r.symbol} className={`clickable ${selected === r.symbol ? "sel" : ""}`} onClick={() => onSelect(r.symbol)}>
                <td className="left">
                  <button type="button" className="linkish" onClick={() => onSelect(r.symbol)}>
                    <b>{r.symbol}</b>
                  </button>
                </td>
                <td className="left name-cell">
                  <span className="ellipsis">{r.name}</span>
                  <span className="muted small">
                    {r.exchange}
                    {r.sector ? ` · ${r.sector}` : ""}
                  </span>
                </td>
                <td>{fmtPrice(r.price)}</td>
                <td className={signClass(r.changePct)}>{fmtPct(r.changePct)}</td>
                <td>
                  <Sparkline data={r.spark} up={r.spark[r.spark.length - 1] >= r.spark[0]} width={70} height={22} />
                </td>
                <td>
                  <span className="score-cell">
                    <ScoreBar value={r.score} /> {r.score > 0 ? "+" : ""}
                    {r.score.toFixed(0)}
                  </span>
                </td>
                <td className="left">
                  <RecBadge rec={r.rec} small />
                </td>
                <td>{r.strength}</td>
                <td className={signClass(r.expectedPct)}>{fmtPct(r.expectedPct)}</td>
                <td>{r.rvol != null ? `${r.rvol.toFixed(1)}×` : "—"}</td>
                <td>${fmtCompact(r.avgDollarVolume)}</td>
                <td>{r.marketCap ? `$${fmtCompact(r.marketCap)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="more">
          <button type="button" className="btn" onClick={() => setLimit((l) => l + 60)}>
            Daha fazla göster ({rows.length - limit} kaldı)
          </button>
        </div>
      )}
      {!rows.length && <div className="pad muted">Filtreye uyan hisse yok.</div>}
    </section>
  );
}
