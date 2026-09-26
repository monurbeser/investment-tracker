"use client";
import { useMemo, useState } from "react";
import type { Instrument, Quote } from "@/lib/types";
import { combineEquity, simulate, type SimulationResult } from "@/lib/perf";
import { mergeLive } from "@/lib/live";
import { fmtDate, fmtMoney, fmtPct, fmtPrice, signClass } from "@/lib/format";
import type { HistoryEntry } from "@/lib/client/useHistories";
import { TvChart, type SeriesSpec } from "./TvChart";
import type { Theme } from "@/lib/client/palette";

interface Props {
  instruments: Instrument[];
  histories: Record<string, HistoryEntry>;
  quotes: Record<string, Quote>;
  colors: Record<string, string>;
  theme: Theme;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function Simulator({ instruments, histories, quotes, colors, theme }: Props) {
  const [amount, setAmount] = useState(10000);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return isoDay(d);
  });
  const [mode, setMode] = useState<"each" | "split">("each");
  const [withDiv, setWithDiv] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const active = instruments.filter((i) => !excluded.has(i.id));
  const per = mode === "split" && active.length ? amount / active.length : amount;
  const dateSec = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);

  const rows = useMemo(() => {
    return active.map((i) => {
      const h = histories[i.id];
      if (!h?.data) return { inst: i, res: null as SimulationResult | null, error: h?.error ?? (h?.loading ? "Yükleniyor…" : "Veri yok"), note: undefined as string | undefined };
      const bars = mergeLive(h.data.usd, i.source === "bond" ? undefined : quotes[i.id], "daily", true);
      const res = simulate(bars, per, dateSec, withDiv);
      const first = bars[0]?.time;
      const late = res && first && dateSec < first ? `Veri ${fmtDate(first)} tarihinde başlıyor; alım bu tarihten yapıldı.` : undefined;
      return { inst: i, res, error: res ? undefined : "Bu tarih için veri yok", note: late ?? h.data.note };
    });
  }, [active, histories, quotes, per, dateSec, withDiv]);

  const ok = rows.filter((r) => r.res);
  const invested = ok.reduce((s, r) => s + r.res!.invested, 0);
  const value = ok.reduce((s, r) => s + r.res!.value, 0);

  const series: SeriesSpec[] = useMemo(() => {
    const s: SeriesSpec[] = ok.map((r) => ({ id: r.inst.id, label: r.inst.symbol.replace(/USDT$/, ""), color: colors[r.inst.id], type: "line", line: r.res!.equity }));
    if (mode === "split" && ok.length > 1) {
      s.push({ id: "__total", label: "Portföy toplamı", color: theme === "dark" ? "#d1d4dc" : "#131722", type: "line", width: 3, line: combineEquity(ok.map((r) => r.res!.equity)) });
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode, colors, theme]);

  return (
    <section className="panel sim">
      <header className="panel-head">
        <h2>Sanal yatırım simülasyonu</h2>
        <span className="muted small">“Şu tarihte X USD koysaydım bugün ne olurdu?” — alım, seçilen günün (veya sonraki ilk işlem gününün) kapanışından</span>
      </header>
      <div className="sim-form">
        <label>
          Tutar (USD)
          <input type="number" min={1} step={100} value={amount} onChange={(e) => setAmount(Math.max(0, +e.target.value))} />
        </label>
        <label>
          Alım tarihi
          <input type="date" value={date} max={isoDay(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Dağıtım">
          <button type="button" className={mode === "each" ? "on" : ""} onClick={() => setMode("each")}>
            Her birine {fmtMoney(amount)}
          </button>
          <button type="button" className={mode === "split" ? "on" : ""} onClick={() => setMode("split")}>
            Eşit böl (karma portföy)
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={withDiv} onChange={(e) => setWithDiv(e.target.checked)} />
          Temettü/kupon dahil (düzeltilmiş kapanış)
        </label>
      </div>
      <div className="chips">
        {instruments.map((i) => (
          <button
            key={i.id}
            type="button"
            className={`chip ${excluded.has(i.id) ? "off" : ""}`}
            onClick={() =>
              setExcluded((s) => {
                const n = new Set(s);
                if (n.has(i.id)) n.delete(i.id);
                else n.add(i.id);
                return n;
              })
            }
          >
            <span className="dot" style={{ background: excluded.has(i.id) ? "transparent" : colors[i.id], borderColor: colors[i.id] }} />
            {i.symbol.replace(/USDT$/, "")}
          </button>
        ))}
      </div>

      {ok.length > 0 && (
        <div className="kpis">
          <div className="kpi">
            <span>Toplam yatırılan</span>
            <b>{fmtMoney(invested)}</b>
          </div>
          <div className="kpi">
            <span>Bugünkü değer</span>
            <b>{fmtMoney(value)}</b>
          </div>
          <div className="kpi">
            <span>Kâr / Zarar</span>
            <b className={signClass(value - invested)}>
              {value - invested >= 0 ? "+" : "−"}
              {fmtMoney(Math.abs(value - invested))}
            </b>
          </div>
          <div className="kpi">
            <span>Toplam getiri</span>
            <b className={signClass(value - invested)}>{fmtPct(invested ? (value / invested - 1) * 100 : null)}</b>
          </div>
        </div>
      )}

      {ok.length > 0 && <TvChart series={series} theme={theme} format="usd" fitKey={`${date}|${mode}|${ok.map((r) => r.inst.id).join()}`} height={260} />}

      <div className="table-wrap">
        <table className="perf">
          <thead>
            <tr>
              <th className="left">Enstrüman</th>
              <th>Alış tarihi</th>
              <th>Alış (USD)</th>
              <th>Adet</th>
              <th>Yatırılan</th>
              <th>Bugün</th>
              <th>K/Z</th>
              <th>Getiri</th>
              <th>Yıllık</th>
              <th>Maks. düşüş</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inst, res, error, note }) => (
              <tr key={inst.id}>
                <td className="left">
                  <span className="dot" style={{ background: colors[inst.id], borderColor: colors[inst.id] }} />
                  <b>{inst.symbol.replace(/USDT$/, "")}</b>
                  {note && (
                    <span className="info" title={note}>
                      {" "}
                      ⓘ
                    </span>
                  )}
                </td>
                {res ? (
                  <>
                    <td>{fmtDate(res.buyTime)}</td>
                    <td>{fmtPrice(res.buyPrice)}</td>
                    <td>{res.units < 1 ? res.units.toPrecision(4) : res.units.toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                    <td>{fmtMoney(res.invested)}</td>
                    <td>{fmtMoney(res.value)}</td>
                    <td className={signClass(res.pnl)}>{fmtMoney(res.pnl)}</td>
                    <td className={signClass(res.pnlPct)}>{fmtPct(res.pnlPct)}</td>
                    <td className={signClass(res.cagrPct)}>{fmtPct(res.cagrPct)}</td>
                    <td className="down">{fmtPct(res.maxDrawdownPct)}</td>
                  </>
                ) : (
                  <td colSpan={9} className="muted left">
                    {error}
                  </td>
                )}
              </tr>
            ))}
            {!instruments.length && (
              <tr>
                <td colSpan={10} className="muted pad">
                  Simülasyon için soldan enstrüman seçin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Tüm tutarlar USD’dir; AED varlıklar 3.6725 sabit kurla, EUR/GBP varlıklar günlük kurla çevrilir. İşlem ücreti, vergi ve saklama ücretleri dahil değildir. Geçmiş performans gelecekteki sonuçların
        göstergesi değildir.
      </p>
    </section>
  );
}
