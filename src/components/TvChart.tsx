"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { CHART_THEME, type Theme } from "@/lib/client/palette";
import { DUBAI_TZ, fmtPct, fmtPrice, fmtMoney } from "@/lib/format";
import type { Bar } from "@/lib/types";

export type ValueFormat = "pct" | "price" | "usd";

export interface SeriesSpec {
  id: string;
  label: string;
  color: string;
  type: "line" | "area" | "candles";
  line?: { time: number; value: number }[];
  bars?: Bar[];
  dashed?: boolean;
  width?: 1 | 2 | 3 | 4;
}

interface Props {
  series: SeriesSpec[];
  theme: Theme;
  format: ValueFormat;
  /** Changing this re-fits the visible range (e.g. period or selection change). */
  fitKey: string;
  height?: number;
  intraday?: boolean;
  currency?: string;
}

const formatter = (f: ValueFormat, currency?: string) => (v: number) =>
  f === "pct" ? fmtPct(v) : f === "usd" ? fmtMoney(v) : fmtPrice(v, currency);

export function TvChart({ series, theme, format, fitKey, height = 420, intraday = false, currency }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const handles = useRef(new Map<string, { api: ISeriesApi<SeriesType>; type: SeriesSpec["type"] }>());
  const lastFit = useRef<string>("");
  const zero = useRef<{ api: ISeriesApi<SeriesType>; line: IPriceLine } | null>(null);
  const [hover, setHover] = useState<{ time: number; values: Record<string, number> } | null>(null);

  // create once
  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: CHART_THEME[theme].text, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, rightOffset: 4, timeVisible: intraday, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
      localization: {
        locale: "tr-TR",
        timeFormatter: (t: Time) =>
          new Date((t as number) * 1000).toLocaleString("tr-TR", {
            timeZone: DUBAI_TZ,
            day: "2-digit",
            month: "short",
            year: "2-digit",
            ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
          }),
      },
    });
    chart.current = c;
    const map = handles.current;
    c.subscribeCrosshairMove((p) => {
      if (!p.time || !p.point) return setHover(null);
      const values: Record<string, number> = {};
      for (const [id, h] of map) {
        const d = p.seriesData.get(h.api) as { value?: number; close?: number } | undefined;
        const v = d?.value ?? d?.close;
        if (v != null) values[id] = v;
      }
      setHover({ time: p.time as number, values });
    });
    return () => {
      map.clear();
      zero.current = null;
      lastFit.current = "";
      c.remove();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intraday]);

  // theme & format
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const t = CHART_THEME[theme];
    c.applyOptions({
      layout: { textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: { vertLine: { color: t.crosshair, labelBackgroundColor: t.border }, horzLine: { color: t.crosshair, labelBackgroundColor: t.border } },
      localization: { priceFormatter: formatter(format, currency) },
    });
  }, [theme, format, currency, intraday]);

  // data
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const t = CHART_THEME[theme];
    const map = handles.current;
    const wanted = new Set(series.map((s) => s.id));
    for (const [id, h] of map) {
      const spec = series.find((s) => s.id === id);
      if (!wanted.has(id) || spec?.type !== h.type) {
        c.removeSeries(h.api);
        map.delete(id);
      }
    }
    for (const s of series) {
      let h = map.get(s.id);
      if (!h) {
        const common = { priceLineVisible: false, lastValueVisible: true, title: "" };
        const api =
          s.type === "candles"
            ? c.addCandlestickSeries({ ...common, upColor: t.up, downColor: t.down, borderVisible: false, wickUpColor: t.up, wickDownColor: t.down })
            : s.type === "area"
              ? c.addAreaSeries({ ...common, lineColor: s.color, topColor: `${s.color}55`, bottomColor: `${s.color}05`, lineWidth: 2 })
              : c.addLineSeries({ ...common, color: s.color, lineWidth: s.width ?? 2, lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid });
        h = { api: api as ISeriesApi<SeriesType>, type: s.type };
        map.set(s.id, h);
      } else if (s.type === "line") {
        h.api.applyOptions({ color: s.color, lineWidth: s.width ?? 2 });
      } else if (s.type === "candles") {
        h.api.applyOptions({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
      } else {
        h.api.applyOptions({ lineColor: s.color, topColor: `${s.color}55`, bottomColor: `${s.color}05` });
      }
      if (s.type === "candles") {
        h.api.setData(
          (s.bars ?? []).map((b) => ({
            time: b.time as UTCTimestamp,
            open: b.open ?? b.close,
            high: b.high ?? Math.max(b.open ?? b.close, b.close),
            low: b.low ?? Math.min(b.open ?? b.close, b.close),
            close: b.close,
          })),
        );
      } else {
        const pts = s.line ?? (s.bars ?? []).map((b) => ({ time: b.time, value: b.close }));
        h.api.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      }
    }
    const first = format === "pct" ? map.values().next().value : undefined;
    if (zero.current && (zero.current.api !== first?.api || !first)) {
      if ([...map.values()].some((h) => h.api === zero.current!.api)) zero.current.api.removePriceLine(zero.current.line);
      zero.current = null;
    }
    if (first && !zero.current) {
      const line = first.api.createPriceLine({ price: 0, color: t.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      zero.current = { api: first.api, line };
    }
    if (lastFit.current !== fitKey && series.some((s) => (s.line?.length ?? s.bars?.length ?? 0) > 0)) {
      c.timeScale().fitContent();
      lastFit.current = fitKey;
    }
  }, [series, theme, fitKey, format]);

  return (
    <div className="tvchart" style={{ height }}>
      <div ref={box} className="tvchart-canvas" />
      {hover && (
        <div className="tvchart-hover">
          <div className="muted">
            {new Date(hover.time * 1000).toLocaleString("tr-TR", {
              timeZone: DUBAI_TZ,
              day: "2-digit",
              month: "short",
              year: "numeric",
              ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
            })}
          </div>
          {series.map((s) =>
            hover.values[s.id] != null ? (
              <div key={s.id} className="tvchart-hover-row">
                <i style={{ background: s.type === "candles" ? CHART_THEME[theme].up : s.color }} />
                <span>{s.label}</span>
                <b>{formatter(format, currency)(hover.values[s.id])}</b>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
