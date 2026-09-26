"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArbitrageResponse, Instrument, Period, SearchResult } from "@/lib/types";
import { CATALOG, DEFAULT_SELECTION, TICKER_TOP } from "@/lib/catalog";
import { PERIODS, PERIOD_LABELS, normalizedSeries, periodReturn, periodStart, sliceFrom } from "@/lib/perf";
import { mergeLive } from "@/lib/live";
import { useQuotes } from "@/lib/client/useQuotes";
import { fetchArbitrage, STATIC } from "@/lib/client/api";
import { useHistories } from "@/lib/client/useHistories";
import { marketStatuses } from "@/lib/client/markets";
import { MAX_SERIES, seriesColor, type Theme } from "@/lib/client/palette";
import { DUBAI_TZ, ago, fmtDateTime, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { TickerTape, type TickerItem } from "./TickerTape";
import { Watchlist, type Tab } from "./Watchlist";
import { TvChart, type SeriesSpec } from "./TvChart";
import { PerformanceTable } from "./PerformanceTable";
import { Simulator } from "./Simulator";
import { ArbitragePanel } from "./ArbitragePanel";

type ChartType = "compare" | "candles" | "area";

interface Saved {
  selected: string[];
  slots: Record<string, number>;
  custom: Instrument[];
  theme: Theme;
  period: Period;
  usd: boolean;
}

const STORE_KEY = "dxb-invest:v1";

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>;
  } catch {
    return {};
  }
}

export function Dashboard() {
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);
  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries(DEFAULT_SELECTION.map((id, i) => [id, i])));
  const [custom, setCustom] = useState<Instrument[]>([]);
  const [period, setPeriod] = useState<Period>("1Y");
  const [chartType, setChartType] = useState<ChartType>("compare");
  const [usd, setUsd] = useState(true);
  const [focus, setFocus] = useState<string>(DEFAULT_SELECTION[0]);
  const [fee, setFee] = useState(0.1);
  const [now, setNow] = useState(() => Date.now());
  const [arb, setArb] = useState<ArbitrageResponse | null>(null);
  const [arbErr, setArbErr] = useState<string | null>(null);

  // restore persisted UI state
  useEffect(() => {
    const s = load();
    if (s.selected?.length) setSelected(s.selected.slice(0, MAX_SERIES));
    if (s.slots) setSlots(s.slots);
    if (s.custom) setCustom(s.custom);
    if (s.theme) setTheme(s.theme);
    if (s.period && PERIODS.includes(s.period)) setPeriod(s.period);
    if (typeof s.usd === "boolean") setUsd(s.usd);
    if (s.selected?.[0]) setFocus(s.selected[0]);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ selected, slots, custom, theme, period, usd } satisfies Saved));
    } catch {
      /* storage unavailable */
    }
  }, [ready, selected, slots, custom, theme, period, usd]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const instruments = useMemo(() => [...CATALOG, ...custom.filter((c) => !CATALOG.some((k) => k.id === c.id))], [custom]);
  const byId = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);
  const selectedInst = useMemo(() => selected.map((id) => byId.get(id)).filter((x): x is Instrument => !!x), [selected, byId]);
  const colors = useMemo(() => Object.fromEntries(selected.map((id) => [id, seriesColor(slots[id] ?? 0, theme)])), [selected, slots, theme]);
  const customIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom]);

  const quoteIds = useMemo(() => {
    const visible = tab === "all" ? instruments : instruments.filter((i) => i.category === tab);
    return Array.from(new Set([...TICKER_TOP, ...selected, ...visible.map((i) => i.id)]));
  }, [tab, instruments, selected]);
  const q = useQuotes(quoteIds);

  const daily = useHistories(selected, "daily");
  const intraday = useHistories(period === "1W" ? selected : [], "intraday");

  // arbitrage / FX poll
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const d = await fetchArbitrage(fee);
        if (alive) {
          setArb(d);
          setArbErr(null);
        }
      } catch (e) {
        if (alive) setArbErr((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(run, 20000);
      }
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fee]);

  const toggle = useCallback(
    (id: string) => {
      if (selected.includes(id)) {
        const next = selected.filter((x) => x !== id);
        setSelected(next);
        if (focus === id && next[0]) setFocus(next[0]);
        return;
      }
      if (selected.length >= MAX_SERIES) return;
      // Colour follows the instrument: take the lowest free palette slot and keep it.
      const used = new Set(selected.map((x) => slots[x]));
      let slot = 0;
      while (used.has(slot)) slot++;
      setSlots({ ...slots, [id]: slot });
      setSelected([...selected, id]);
      if (!selected.length) setFocus(id);
    },
    [selected, slots, focus],
  );

  const addFromSearch = (r: SearchResult) => {
    if (!byId.has(r.id)) {
      setCustom((c) => [...c, { id: r.id, source: r.source, symbol: r.symbol, name: r.name, category: r.category, currency: r.currency, exchange: r.exchange }]);
    }
    if (!selected.includes(r.id)) toggle(r.id);
    setTab(r.category);
  };

  const removeCustom = (id: string) => {
    setSelected((s) => s.filter((x) => x !== id));
    setCustom((c) => c.filter((x) => x.id !== id));
  };

  // ---- chart data ----
  const nowSec = Math.floor(now / 1000);
  const hist = period === "1W" ? intraday : daily;
  const res = period === "1W" ? "intraday" : "daily";
  const start = periodStart(period, nowSec);
  const focusInst = byId.get(focus) ?? selectedInst[0];
  const effectiveType: ChartType = selectedInst.length <= 1 && chartType === "compare" ? "area" : chartType;

  const series: SeriesSpec[] = useMemo(() => {
    if (effectiveType === "compare") {
      return selectedInst.map((i) => {
        const h = hist[i.id]?.data;
        const src = h ? (usd ? h.usd : h.bars) : [];
        const bars = mergeLive(src, i.source === "bond" ? undefined : q.quotes[i.id], h?.resolution ?? res, usd);
        return { id: i.id, label: i.symbol.replace(/USDT$/, ""), color: colors[i.id], type: "line" as const, line: normalizedSeries(bars, start) };
      });
    }
    if (!focusInst) return [];
    const h = hist[focusInst.id]?.data;
    const native = effectiveType === "candles" || !usd;
    const src = h ? (native ? h.bars : h.usd) : [];
    const bars = mergeLive(src, focusInst.source === "bond" ? undefined : q.quotes[focusInst.id], h?.resolution ?? res, !native);
    return [{ id: focusInst.id, label: focusInst.symbol.replace(/USDT$/, ""), color: colors[focusInst.id] ?? seriesColor(0, theme), type: effectiveType, bars: sliceFrom(bars, start) }];
    // `now` only matters via `start`, which changes once per bucket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType, selectedInst, hist, usd, q.quotes, colors, focusInst, start, theme, res]);

  const chartCurrency = effectiveType !== "compare" && focusInst ? (effectiveType === "candles" || !usd ? (hist[focusInst.id]?.data?.currency ?? focusInst.currency) : "USD") : undefined;
  const fitKey = `${period}|${effectiveType}|${usd}|${effectiveType === "compare" ? selected.join() : focusInst?.id}`;
  const chartLoading = selectedInst.some((i) => hist[i.id]?.loading && !hist[i.id]?.data);
  const chartErrors = selectedInst.filter((i) => hist[i.id]?.error && !hist[i.id]?.data);

  // ---- tickers ----
  const topItems: TickerItem[] = TICKER_TOP.map((id) => {
    const i = byId.get(id);
    const qt = q.quotes[id];
    return {
      key: id,
      label: i ? i.symbol.replace(/USDT$/, "").replace(/^\^/, "") : id,
      value: qt ? fmtPrice(qt.price) : "…",
      raw: qt?.price,
      changePct: qt?.changePct ?? null,
      sub: i?.name,
      onClick: () => !selected.includes(id) && toggle(id),
    };
  });
  const bottomItems: TickerItem[] = [
    ...(arb?.fx ?? []).map((r) => ({ key: r.pair, label: r.label, value: fmtPrice(r.rate), raw: r.rate, changePct: r.changePct })),
    ...(arb?.premiums ?? []).slice(0, 6).map((p) => ({ key: `p-${p.fiat}`, label: `USDT/${p.fiat} primi`, value: fmtPct(p.premiumPct), raw: p.premiumPct, sub: "Binance vs resmi" })),
    ...(arb?.triangular ?? []).slice(0, 3).map((t) => ({ key: `t-${t.symbols.join()}`, label: t.path.join("→"), value: `net ${fmtPct(t.netPct, 3)}`, raw: t.netPct, sub: "üçgen arbitraj" })),
    ...(arb?.peg.market != null ? [{ key: "peg", label: "AED peg sapması", value: fmtPct(arb.peg.deviationPct, 3), raw: arb.peg.deviationPct }] : []),
  ];

  const demo = q.demo || !!arb?.demo;
  const snapshotAt = STATIC
    ? Object.values(q.quotes)
        .filter((x) => !x.id.startsWith("binance:"))
        .reduce<string | null>((m, x) => (!m || x.fetchedAt > m ? x.fetchedAt : m), null)
    : null;
  const markets = marketStatuses(new Date(now));
  const fq = focusInst ? q.quotes[focusInst.id] : undefined;
  const fh = focusInst ? hist[focusInst.id]?.data : undefined;
  const focusRet = fh && focusInst ? (periodReturn(mergeLive(fh.bars, focusInst.source === "bond" ? undefined : fq, fh.resolution, false), period, nowSec)?.pct ?? null) : null;

  return (
    <div className="app">
      <TickerTape position="top" items={topItems} label="Piyasa kayan yazısı" />

      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> DXB Invest Terminal
          {demo && <span className="demo">DEMO VERİ</span>}
          {STATIC && (
            <span className="badge" title="GitHub Pages sürümü: kripto Binance’ten canlı; Yahoo kaynaklı veriler GitHub Actions ile ~15 dakikada bir yenilenir">
              Yahoo verisi: {snapshotAt ? `${new Date(snapshotAt).toLocaleTimeString("tr-TR", { timeZone: DUBAI_TZ, hour: "2-digit", minute: "2-digit" })} (${ago(snapshotAt, now)})` : "—"}
            </span>
          )}
        </div>
        <div className="markets">
          {markets.map((m) => (
            <span key={m.key} className="mkt" title={m.hours}>
              <i className={m.open ? "open" : "closed"} />
              {m.label} <span className="muted">{m.open ? "açık" : "kapalı"}</span>
            </span>
          ))}
        </div>
        <div className="top-right">
          <span className="live" title={`Kotasyonlar her 15 sn yenilenir. Kripto: Binance WebSocket ${q.wsConnected ? "bağlı" : "bağlı değil"}`}>
            <i className={q.wsConnected || q.lastFetch ? "on" : ""} />
            Son güncelleme: {q.lastFetch ? new Date(q.lastFetch).toLocaleTimeString("tr-TR", { timeZone: DUBAI_TZ }) : "—"}
            {q.wsConnected && <span className="badge">WS canlı</span>}
          </span>
          <span className="clock">{new Date(now).toLocaleTimeString("tr-TR", { timeZone: DUBAI_TZ })} Dubai</span>
          <button type="button" className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Tema değiştir" title="Tema">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="layout">
        <Watchlist
          instruments={instruments}
          quotes={q.quotes}
          errors={q.errors}
          selected={selected}
          colors={colors}
          tab={tab}
          onTab={setTab}
          onToggle={toggle}
          onAdd={addFromSearch}
          onRemoveCustom={removeCustom}
          customIds={customIds}
          maxReached={selected.length >= MAX_SERIES}
        />

        <main className="main">
          <section className="panel chart-panel">
            <div className="chart-toolbar">
              <div className="seg" role="group" aria-label="Periyot">
                {PERIODS.map((p) => (
                  <button key={p} type="button" className={p === period ? "on" : ""} onClick={() => setPeriod(p)} title={PERIOD_LABELS[p]}>
                    {p === "1W" ? "1H" : p === "1M" ? "1A" : p === "3M" ? "3A" : p === "6M" ? "6A" : p === "1Y" ? "1Y" : p}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Grafik türü">
                <button type="button" className={effectiveType === "compare" ? "on" : ""} disabled={selectedInst.length < 2} onClick={() => setChartType("compare")}>
                  % Karşılaştır
                </button>
                <button type="button" className={effectiveType === "candles" ? "on" : ""} onClick={() => setChartType("candles")}>
                  Mum
                </button>
                <button type="button" className={effectiveType === "area" ? "on" : ""} onClick={() => setChartType("area")}>
                  Alan
                </button>
              </div>
              <label className="check small">
                <input type="checkbox" checked={usd} onChange={(e) => setUsd(e.target.checked)} /> USD bazlı
              </label>
            </div>

            {effectiveType === "compare" ? (
              <div className="legend">
                {selectedInst.map((i) => {
                  const pts = series.find((s) => s.id === i.id)?.line;
                  const r = pts?.length ? pts[pts.length - 1].value : null;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      className="legend-item"
                      onClick={() => {
                        setFocus(i.id);
                        setChartType("area");
                      }}
                      title="Tek başına göster"
                    >
                      <i style={{ background: colors[i.id] }} />
                      <b>{i.symbol.replace(/USDT$/, "")}</b>
                      <span className="muted">{i.name}</span>
                      <span className={signClass(r)}>{fmtPct(r)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              focusInst && (
                <div className="quote-head">
                  <div className="qh-name">
                    <select value={focusInst.id} onChange={(e) => setFocus(e.target.value)} aria-label="Enstrüman">
                      {selectedInst.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.symbol} — {i.name}
                        </option>
                      ))}
                    </select>
                    <span className="muted small">{focusInst.exchange}</span>
                  </div>
                  <div className="qh-price">
                    <b>{fq ? fmtPrice(fq.price) : "—"}</b> <span className="muted">{fq?.currency ?? focusInst.currency}</span>
                    <span className={signClass(fq?.changePct)}>
                      {fq?.change != null ? `${fq.change >= 0 ? "+" : ""}${fmtPrice(fq.change)}` : ""} ({fmtPct(fq?.changePct)})
                    </span>
                    {focusRet != null && (
                      <span className={`small ${signClass(focusRet)}`}>
                        {PERIOD_LABELS[period]}: {fmtPct(focusRet)}
                      </span>
                    )}
                  </div>
                </div>
              )
            )}

            <div className="chart-wrap">
              {selectedInst.length ? (
                <TvChart
                  series={series}
                  theme={theme}
                  format={effectiveType === "compare" ? "pct" : "price"}
                  fitKey={fitKey}
                  intraday={period === "1W"}
                  currency={chartCurrency}
                  height={440}
                />
              ) : (
                <div className="empty">Soldaki listeden bir veya daha fazla enstrüman seçin (UAE, US, ETF, tahvil, kripto karma seçilebilir).</div>
              )}
              {chartLoading && <div className="chart-overlay">Veri yükleniyor…</div>}
            </div>

            <footer className="chart-foot">
              {(effectiveType === "compare" ? selectedInst : focusInst ? [focusInst] : []).map((i) => {
                const h = hist[i.id];
                const qt = q.quotes[i.id];
                const live = qt?.asOf && h?.data?.lastDataAt && i.source !== "bond" ? (qt.asOf > h.data.lastDataAt ? qt.asOf : h.data.lastDataAt) : (h?.data?.lastDataAt ?? null);
                return (
                  <span key={i.id} className="foot-item" title={h?.data?.note}>
                    <i style={{ background: colors[i.id] }} />
                    <b>{i.symbol.replace(/USDT$/, "")}</b> son veri: {fmtDateTime(live, true)} <span className="muted">({ago(live, now)})</span>
                    <span className="muted"> · {qt?.source === "Binance WS" ? "Binance WebSocket" : (h?.data?.source ?? "…")}</span>
                    {h?.data?.fetchedAt && <span className="muted"> · çekildi {new Date(h.data.fetchedAt).toLocaleTimeString("tr-TR", { timeZone: DUBAI_TZ })}</span>}
                    {h?.data?.note && <span className="info"> ⓘ</span>}
                  </span>
                );
              })}
              {chartErrors.map((i) => (
                <span key={`e-${i.id}`} className="foot-item down">
                  {i.symbol}: veri alınamadı — {hist[i.id]?.error}
                </span>
              ))}
              <span className="muted small">Saatler Dubai (GST, UTC+4). {period === "1W" ? "1 hafta: 15–30 dk’lık barlar." : "Günlük kapanışlar."}</span>
            </footer>
          </section>

          <PerformanceTable instruments={selectedInst} histories={daily} quotes={q.quotes} colors={colors} usd={usd} period={period} onPeriod={setPeriod} now={now} />

          <div className="grid2">
            <Simulator instruments={selectedInst} histories={daily} quotes={q.quotes} colors={colors} theme={theme} />
            <ArbitragePanel data={arb} error={arbErr} fee={fee} onFee={setFee} now={now} />
          </div>

          <p className="disclaimer muted small">
            {STATIC && "Bu, GitHub Pages sürümüdür: kripto fiyatları ve arbitraj tarayıcıdan doğrudan Binance’ten canlı gelir; Yahoo kaynaklı veriler (UAE/US hisseleri, ETF, döviz, tahvil modeli) ~15 dakikada bir GitHub Actions ile yenilenir. "}
            Veri kaynakları: Yahoo Finance (DFM, NYSE/NASDAQ, LSE ETF’leri, döviz, ABD Hazine getirileri), Binance Spot REST + WebSocket (kripto, arbitraj). UAE devlet tahvilleri için ücretsiz canlı fiyat
            akışı bulunmadığından, aynı vadeli ABD Hazine getirisi + ihraççı spreadi ile modellenmiş toplam getiri endeksi gösterilir. Bu panel yatırım tavsiyesi değildir.
          </p>
        </main>
      </div>

      <TickerTape position="bottom" items={bottomItems} secondsPerItem={5} label="Döviz ve arbitraj kayan yazısı" />
    </div>
  );
}
