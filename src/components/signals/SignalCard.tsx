"use client";
import type { SignalRow } from "@/lib/signals/types";
import { fmtCompact, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { LevelBar, RecBadge, Sparkline, StrengthBar } from "./parts";

export function SignalCard({ row, rank, active, onSelect }: { row: SignalRow; rank: number; active: boolean; onSelect: (s: string) => void }) {
  const buy = row.score >= 0;
  return (
    <button type="button" className={`sig-card ${buy ? "buy" : "sell"}${active ? " active" : ""}`} onClick={() => onSelect(row.symbol)} aria-pressed={active}>
      <div className="sc-head">
        <span className="sc-rank">{rank}</span>
        <div className="sc-id">
          <b>{row.symbol}</b>
          <span className="muted small ellipsis">{row.name}</span>
        </div>
        <RecBadge rec={row.rec} small />
      </div>
      <div className="sc-mid">
        <div>
          <div className="sc-price">{fmtPrice(row.price)} <span className="muted small">USD</span></div>
          <div className={`small ${signClass(row.changePct)}`}>{fmtPct(row.changePct)} bugün</div>
        </div>
        <Sparkline data={row.spark} up={row.spark[row.spark.length - 1] >= row.spark[0]} width={110} height={36} />
      </div>
      <div className="sc-strength">
        <span className="muted small">Sinyal kuvveti</span>
        <StrengthBar value={row.strength} />
        <b className="small">{row.strength}</b>
      </div>
      <div className="sc-target">
        <div>
          <span className="muted small">{buy ? "Tahmini kazanç (20 gün)" : "Tahmini düşüş (20 gün)"}</span>
          <b className={buy ? "up" : "down"}>{fmtPct(row.expectedPct)}</b>
        </div>
        <div className="right">
          <span className="muted small">Hedef fiyat</span>
          <b>{fmtPrice(row.targetPrice)}</b>
        </div>
      </div>
      <LevelBar price={row.price} stop={row.stop} t1={row.t1} t2={row.t2} t3={row.t3} buy={buy} />
      <div className="sc-levels small">
        <span title="Zarar kes">Stop <b>{fmtPrice(row.stop)}</b></span>
        <span>H1 <b>{fmtPrice(row.t1)}</b></span>
        <span>H2 <b>{fmtPrice(row.t2)}</b></span>
        <span>H3 <b>{fmtPrice(row.t3)}</b></span>
      </div>
      <div className="sc-foot muted small">
        <span>{row.exchange}</span>
        {row.sector && <span>{row.sector}</span>}
        <span title="Son 1 ay ortalama günlük işlem hacmi (USD)">${fmtCompact(row.avgDollarVolume)}/gün</span>
        {row.rvol != null && <span title="Bugünkü hacim / 20 günlük ortalama">RVOL {row.rvol.toFixed(1)}×</span>}
        {row.hitRate != null && <span title="Geçmiş 5 yılda benzer skorlardan sonra 20 günde sinyal yönünde kapanış oranı">İsabet %{Math.round(row.hitRate * 100)}</span>}
      </div>
    </button>
  );
}
