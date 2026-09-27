"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import { CHART_THEME, type Theme } from "@/lib/client/palette";
import { fmtCompact, fmtPrice } from "@/lib/format";
import { buildFrame } from "@/lib/signals/engine";
import type { Analysis, OhlcvBar } from "@/lib/signals/types";

type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y";
type Sub = "volume" | "rsi" | "macd" | "score";
const RANGES: { key: Range; label: string }[] = [
  { key: "1M", label: "1A" },
  { key: "3M", label: "3A" },
  { key: "6M", label: "6A" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" },
];
const SUBS: { key: Sub; label: string }[] = [
  { key: "volume", label: "Hacim" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
  { key: "score", label: "Sinyal skoru" },
];

// Overlay colours: fixed per overlay, taken from the dashboard's validated series palette.
const OVERLAY = {
  dark: { ema20: "#3987e5", ema50: "#c98500", ema200: "#d55181", bb: "#9085e9", st: "#199e70", level: "#3987e5" },
  light: { ema20: "#2a78d6", ema50: "#eda100", ema200: "#e87ba4", bb: "#4a3aa7", st: "#1baf7a", level: "#2a78d6" },
};

interface Props {
  bars: OhlcvBar[];
  analysis: Analysis | null;
  theme: Theme;
  symbol: string;
}

const ts = (t: number) => t as UTCTimestamp;

export function SignalChart({ bars, analysis, theme, symbol }: Props) {
  const mainBox = useRef<HTMLDivElement>(null);
  const subBox = useRef<HTMLDivElement>(null);
  const charts = useRef<{ main: IChartApi; sub: IChartApi } | null>(null);
  const [range, setRange] = useState<Range>("6M");
  const [sub, setSub] = useState<Sub>("volume");
  const [show, setShow] = useState({ ema: true, bb: false, st: true, marks: true, levels: true });
  const [hover, setHover] = useState<OhlcvBar | null>(null);
  const frame = useMemo(() => (bars.length ? buildFrame(bars) : null), [bars]);

  // create charts once per theme
  useEffect(() => {
    if (!mainBox.current || !subBox.current) return;
    const t = CHART_THEME[theme];
    const base = {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: t.text, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t.crosshair, labelBackgroundColor: t.border }, horzLine: { color: t.crosshair, labelBackgroundColor: t.border } },
      rightPriceScale: { borderVisible: false, minimumWidth: 72 },
      timeScale: { borderVisible: false, rightOffset: 6 },
      localization: {
        locale: "tr-TR",
        timeFormatter: (x: Time) => new Date((x as number) * 1000).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "2-digit", month: "short", year: "2-digit" }),
      },
    };
    const main = createChart(mainBox.current, base);
    const subc = createChart(subBox.current, { ...base, layout: { ...base.layout, attributionLogo: false } });
    main.timeScale().subscribeVisibleLogicalRangeChange((r) => r && subc.timeScale().setVisibleLogicalRange(r));
    subc.timeScale().subscribeVisibleLogicalRangeChange((r) => r && main.timeScale().setVisibleLogicalRange(r));
    charts.current = { main, sub: subc };
    return () => {
      main.remove();
      subc.remove();
      charts.current = null;
    };
  }, [theme]);

  // data
  useEffect(() => {
    const c = charts.current;
    if (!c || !frame || !bars.length) return;
    const t = CHART_THEME[theme];
    const o = OVERLAY[theme];
    const added: ISeriesApi<"Line" | "Candlestick" | "Histogram">[] = [];
    const subAdded: ISeriesApi<"Line" | "Histogram">[] = [];

    const candles = c.main.addCandlestickSeries({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down, borderVisible: false, priceLineVisible: true, title: "" });
    candles.setData(bars.map((b) => ({ time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    added.push(candles);
    const line = (vals: number[], color: string, width: 1 | 2 = 1, style = LineStyle.Solid, title = "") => {
      const s = c.main.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title });
      s.setData(bars.map((b, i) => (isFinite(vals[i]) ? { time: ts(b.time), value: vals[i] } : { time: ts(b.time) })));
      added.push(s);
      return s;
    };
    if (show.ema) {
      line(frame.ema20, o.ema20, 1, LineStyle.Solid, "EMA20");
      line(frame.ema50, o.ema50, 1, LineStyle.Solid, "EMA50");
      line(frame.ema200, o.ema200, 2, LineStyle.Solid, "EMA200");
    }
    if (show.bb) {
      line(frame.bb.upper, o.bb, 1, LineStyle.Dotted);
      line(frame.bb.mid, o.bb, 1, LineStyle.Dashed);
      line(frame.bb.lower, o.bb, 1, LineStyle.Dotted);
    }
    if (show.st) {
      const up = frame.st.line.map((v, i) => (frame.st.dir[i] === 1 ? v : NaN));
      const dn = frame.st.line.map((v, i) => (frame.st.dir[i] === -1 ? v : NaN));
      line(up, t.up, 1, LineStyle.Dashed);
      line(dn, t.down, 1, LineStyle.Dashed);
    }
    if (show.marks && analysis) {
      const markers: SeriesMarker<Time>[] = analysis.events.map((e) => ({
        time: ts(e.time),
        position: e.kind === "buy" ? "belowBar" : "aboveBar",
        color: e.kind === "buy" ? t.up : t.down,
        shape: e.kind === "buy" ? "arrowUp" : "arrowDown",
        text: e.kind === "buy" ? "AL" : "SAT",
      }));
      candles.setMarkers(markers);
    }
    if (show.levels && analysis) {
      const L = analysis.levels;
      const buy = analysis.score >= 0;
      const pl = (price: number, title: string, color: string, style = LineStyle.Dashed) =>
        candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
      pl(L.t1, "H1", buy ? t.up : t.down);
      pl(L.t2, "H2 (hedef)", buy ? t.up : t.down, LineStyle.Solid);
      pl(L.t3, "H3", buy ? t.up : t.down);
      pl(L.stop, "Stop", t.crosshair);
    }

    // sub pane
    const s = sub;
    if (s === "volume") {
      const h = c.sub.addHistogramSeries({ priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: true });
      h.setData(bars.map((b) => ({ time: ts(b.time), value: b.volume, color: b.close >= b.open ? `${t.up}99` : `${t.down}99` })));
      const avg = c.sub.addLineSeries({ color: o.ema50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      avg.setData(bars.map((b, i) => (isFinite(frame.volSma20[i]) ? { time: ts(b.time), value: frame.volSma20[i] } : { time: ts(b.time) })));
      subAdded.push(h, avg);
    } else if (s === "rsi") {
      const r = c.sub.addLineSeries({ color: o.ema20, lineWidth: 2, priceLineVisible: false });
      r.setData(bars.map((b, i) => (isFinite(frame.rsi[i]) ? { time: ts(b.time), value: frame.rsi[i] } : { time: ts(b.time) })));
      r.createPriceLine({ price: 70, color: t.down, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "70" });
      r.createPriceLine({ price: 30, color: t.up, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "30" });
      subAdded.push(r);
    } else if (s === "macd") {
      const hist = c.sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      hist.setData(bars.map((b, i) => (isFinite(frame.macd.hist[i]) ? { time: ts(b.time), value: frame.macd.hist[i], color: frame.macd.hist[i] >= 0 ? `${t.up}aa` : `${t.down}aa` } : { time: ts(b.time) })));
      const ml = c.sub.addLineSeries({ color: o.ema20, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: "MACD" });
      ml.setData(bars.map((b, i) => (isFinite(frame.macd.line[i]) ? { time: ts(b.time), value: frame.macd.line[i] } : { time: ts(b.time) })));
      const sl = c.sub.addLineSeries({ color: o.ema50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Sinyal" });
      sl.setData(bars.map((b, i) => (isFinite(frame.macd.signal[i]) ? { time: ts(b.time), value: frame.macd.signal[i] } : { time: ts(b.time) })));
      subAdded.push(hist, ml, sl);
    } else {
      const map = new Map((analysis?.scoreHistory ?? []).map((p) => [p.time, p.value]));
      const h = c.sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: true });
      h.setData(bars.map((b) => (map.has(b.time) ? { time: ts(b.time), value: map.get(b.time)!, color: map.get(b.time)! >= 0 ? `${t.up}aa` : `${t.down}aa` } : { time: ts(b.time) })));
      h.createPriceLine({ price: 15, color: t.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "Al" });
      h.createPriceLine({ price: -15, color: t.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "Sat" });
      subAdded.push(h);
    }

    const onMove = (p: { time?: Time }) => {
      if (!p.time) return setHover(null);
      const b = bars.find((x) => x.time === (p.time as number));
      setHover(b ?? null);
    };
    c.main.subscribeCrosshairMove(onMove);
    return () => {
      // The charts may already be gone (theme change / unmount remove them first).
      if (charts.current !== c) return;
      c.main.unsubscribeCrosshairMove(onMove);
      for (const x of added) c.main.removeSeries(x);
      for (const x of subAdded) c.sub.removeSeries(x);
    };
  }, [bars, frame, analysis, theme, show, sub]);

  // visible range
  useEffect(() => {
    const c = charts.current;
    if (!c || !bars.length) return;
    const last = bars[bars.length - 1].time;
    const d = new Date(last * 1000);
    const from =
      range === "YTD"
        ? Date.UTC(d.getUTCFullYear(), 0, 1) / 1000
        : last - { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "5Y": 1830 }[range] * 86400;
    c.main.timeScale().setVisibleRange({ from: ts(Math.max(from, bars[0].time)), to: ts(last) });
  }, [range, bars, theme, sub, show]);

  const lastBar = bars[bars.length - 1];
  const hb = hover ?? lastBar;
  const prev = hb ? bars[bars.indexOf(hb) - 1] : undefined;
  return (
    <div className="sigchart">
      <div className="chart-toolbar">
        <div className="seg" role="group" aria-label="Dönem">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={range === r.key ? "on" : ""} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Katmanlar">
          {(
            [
              ["ema", "EMA 20/50/200"],
              ["bb", "Bollinger"],
              ["st", "Supertrend"],
              ["marks", "Al/Sat işaretleri"],
              ["levels", "Hedef & stop"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={show[k] ? "on" : ""} aria-pressed={show[k]} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {hb && (
        <div className="ohlc small">
          <b>{symbol}</b>
          <span className="muted">{new Date(hb.time * 1000).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })}</span>
          <span>A {fmtPrice(hb.open)}</span>
          <span>Y {fmtPrice(hb.high)}</span>
          <span>D {fmtPrice(hb.low)}</span>
          <span>K {fmtPrice(hb.close)}</span>
          {prev && <span className={hb.close >= prev.close ? "up" : "down"}>{(((hb.close / prev.close) - 1) * 100).toFixed(2)}%</span>}
          <span>Hacim {fmtCompact(hb.volume)}</span>
          {show.ema && (
            <span className="legend-inline">
              <i style={{ background: OVERLAY[theme].ema20 }} />
              EMA20 <i style={{ background: OVERLAY[theme].ema50 }} />
              EMA50 <i style={{ background: OVERLAY[theme].ema200 }} />
              EMA200
            </span>
          )}
        </div>
      )}
      <div className="sig-main" ref={mainBox} />
      <div className="seg sub-seg" role="group" aria-label="Alt panel">
        {SUBS.map((x) => (
          <button key={x.key} type="button" className={sub === x.key ? "on" : ""} onClick={() => setSub(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="sig-sub" ref={subBox} />
    </div>
  );
}
