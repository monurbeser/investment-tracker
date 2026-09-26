"use client";
import { useEffect, useRef, useState } from "react";
import { fmtPct, signClass } from "@/lib/format";

export interface TickerItem {
  key: string;
  label: string;
  value: string;
  raw?: number | null;
  changePct?: number | null;
  sub?: string;
  onClick?: () => void;
}

function Flash({ raw, children }: { raw?: number | null; children: React.ReactNode }) {
  const prev = useRef(raw);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (raw != null && prev.current != null && raw !== prev.current) {
      setCls(raw > prev.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setCls(""), 900);
      prev.current = raw;
      return () => clearTimeout(t);
    }
    prev.current = raw;
  }, [raw]);
  return <span className={`tick-val ${cls}`}>{children}</span>;
}

/** Continuously scrolling marquee; pauses on hover. Content is rendered twice for a seamless loop. */
export function TickerTape({ items, position, secondsPerItem = 4.5, label }: { items: TickerItem[]; position: "top" | "bottom"; secondsPerItem?: number; label: string }) {
  const duration = Math.max(30, items.length * secondsPerItem);
  const row = (dup: boolean) =>
    items.map((it) => (
      <button key={`${dup ? "d" : "o"}-${it.key}`} className="tick" onClick={it.onClick} tabIndex={dup ? -1 : 0} aria-hidden={dup || undefined} type="button">
        <span className="tick-label">{it.label}</span>
        <Flash raw={it.raw}>{it.value}</Flash>
        {it.changePct !== undefined && (
          <span className={`tick-chg ${signClass(it.changePct)}`}>
            {it.changePct != null && it.changePct > 0 ? "▲" : it.changePct != null && it.changePct < 0 ? "▼" : ""} {fmtPct(it.changePct)}
          </span>
        )}
        {it.sub && <span className="tick-sub">{it.sub}</span>}
      </button>
    ));
  return (
    <div className={`tape tape-${position}`} role="marquee" aria-label={label}>
      {items.length ? (
        <div className="tape-track" style={{ animationDuration: `${duration}s` }}>
          <div className="tape-group">{row(false)}</div>
          <div className="tape-group">{row(true)}</div>
        </div>
      ) : (
        <div className="tape-empty">Veriler yükleniyor…</div>
      )}
    </div>
  );
}
