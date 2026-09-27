"use client";
import { useEffect, useRef } from "react";
import type { Theme } from "@/lib/client/palette";

/**
 * TradingView "Advanced Chart" embed (free widget, data served by TradingView).
 * Any interval, drawing tools and TradingView's own indicator library.
 */
export function TradingViewWidget({ symbol, theme, height = 560 }: { symbol: string; theme: Theme; height?: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    el.appendChild(inner);
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.type = "text/javascript";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/New_York",
      theme,
      style: "1",
      locale: "tr",
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      details: true,
      calendar: false,
      studies: ["STD;RSI", "STD;MACD", "STD;Supertrend"],
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol, theme]);

  return <div className="tradingview-widget-container tvw" ref={box} style={{ height }} />;
}
