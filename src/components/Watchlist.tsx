"use client";
import { useEffect, useMemo, useState } from "react";
import type { Category, Instrument, Quote, SearchResult } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_SHORT } from "@/lib/catalog";
import { fmtPct, fmtPrice, signClass } from "@/lib/format";

export type Tab = "all" | Category;
const TABS: Tab[] = ["all", "uae", "us", "etf", "bond", "crypto"];

interface Props {
  instruments: Instrument[];
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  selected: string[];
  colors: Record<string, string>;
  tab: Tab;
  onTab: (t: Tab) => void;
  onToggle: (id: string) => void;
  onAdd: (r: SearchResult) => void;
  onRemoveCustom: (id: string) => void;
  customIds: Set<string>;
  maxReached: boolean;
}

export function Watchlist(p: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      setSearchErr(null);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results: SearchResult[]; errors: string[] }) => {
          setResults(d.results ?? []);
          setSearchErr(d.errors?.length ? d.errors.join(" · ") : null);
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const list = useMemo(() => (p.tab === "all" ? p.instruments : p.instruments.filter((i) => i.category === p.tab)), [p.instruments, p.tab]);
  const known = useMemo(() => new Set(p.instruments.map((i) => i.id)), [p.instruments]);

  return (
    <aside className="watch panel">
      <div className="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sembol ara (ör. EMAAR, NVDA, PEPE, VWRA)…" aria-label="Enstrüman ara" />
        {q && (
          <div className="search-results">
            {searching && <div className="muted pad">Aranıyor…</div>}
            {!searching && !results.length && <div className="muted pad">Sonuç yok{searchErr ? ` (${searchErr})` : ""}</div>}
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="search-row"
                onClick={() => {
                  p.onAdd(r);
                  setQ("");
                }}
              >
                <span className="sym">{r.symbol}</span>
                <span className="name">{r.name}</span>
                <span className="badge">{r.exchange ?? CATEGORY_SHORT[r.category]}</span>
                <span className="muted">{known.has(r.id) ? "listede" : "+ ekle"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={p.tab === t} className={p.tab === t ? "on" : ""} onClick={() => p.onTab(t)} type="button" title={t === "all" ? "Tümü" : CATEGORY_LABELS[t]}>
            {t === "all" ? "Tümü" : CATEGORY_SHORT[t]}
          </button>
        ))}
      </div>
      <div className="watch-head">
        <span>Sembol</span>
        <span>Son</span>
        <span>Değ.</span>
      </div>
      <div className="watch-list">
        {list.map((i) => {
          const qt = p.quotes[i.id];
          const sel = p.selected.includes(i.id);
          const err = p.errors[i.id];
          return (
            <div key={i.id} className={`watch-row ${sel ? "sel" : ""}`}>
              <button
                type="button"
                className="watch-main"
                onClick={() => p.onToggle(i.id)}
                disabled={!sel && p.maxReached}
                title={sel ? "Grafikten çıkar" : p.maxReached ? "En fazla 8 enstrüman" : "Grafiğe ekle"}
              >
                <span className="dot" style={{ background: sel ? p.colors[i.id] : "transparent", borderColor: sel ? p.colors[i.id] : undefined }} />
                <span className="watch-id">
                  <span className="sym">{i.symbol.replace(/USDT$/, "")}</span>
                  <span className="name">{i.name}</span>
                </span>
                <span className="num">{qt ? fmtPrice(qt.price) : err ? <span title={err}>⚠</span> : "…"}</span>
                <span className={`num ${signClass(qt?.changePct)}`}>{fmtPct(qt?.changePct)}</span>
              </button>
              {p.customIds.has(i.id) && (
                <button type="button" className="x" onClick={() => p.onRemoveCustom(i.id)} title="Listeden kaldır" aria-label="Listeden kaldır">
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
