"use client";
import type { Analysis, Group, StockDetail, StockInfo } from "@/lib/signals/types";
import { GROUP_LABEL, HORIZON, REC_LABEL } from "@/lib/signals/engine";
import { fmtCompact, fmtDateTime, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { Gauge, RecBadge, ScoreBar } from "./parts";

const GROUPS: Group[] = ["trend", "momentum", "volume", "volatility"];

const usd = (v: number | undefined) => (v == null || !isFinite(v) ? "—" : `$${fmtCompact(v)}`);
const pct = (v: number | undefined, digits = 2) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | undefined, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
const date = (sec: number | undefined) =>
  sec ? new Date(sec * 1000).toLocaleDateString("tr-TR", { timeZone: "America/New_York", day: "2-digit", month: "short", year: "numeric" }) : "—";

const barDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

const REC_KEY_TR: Record<string, string> = {
  strong_buy: "Kuvvetli Al",
  buy: "Al",
  hold: "Tut",
  underperform: "Endeks altı",
  sell: "Sat",
  strong_sell: "Kuvvetli Sat",
  none: "—",
};

const MARKET_STATE: Record<string, string> = { PRE: "Seans öncesi", REGULAR: "Seans açık", POST: "Seans sonrası", POSTPOST: "Kapalı", PREPRE: "Kapalı", CLOSED: "Kapalı" };

function KV({ k, v, cls, title }: { k: string; v: React.ReactNode; cls?: string; title?: string }) {
  return (
    <div className="kv" title={title}>
      <span>{k}</span>
      <b className={cls}>{v}</b>
    </div>
  );
}

/** Identity + recommendation gauge + key levels. */
export function StockStatus({ detail, analysis }: { detail: StockDetail; analysis: Analysis }) {
  const info = detail.info;
  const L = analysis.levels;
  const cal = analysis.calibration;
  const buy = analysis.score >= 0;
  const website = info.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <section className="panel status">
      <div className="st-id">
        <div className="st-title">
          <h2>
            {detail.symbol} <RecBadge rec={analysis.rec} />
          </h2>
          <div className="st-name">{info.longName ?? info.shortName ?? detail.symbol}</div>
          <div className="st-meta muted small">
            <span>
              Borsa: <b>{info.fullExchangeName ?? info.exchange ?? "—"}</b>
            </span>
            {info.sector && (
              <span>
                Sektör: <b>{info.sector}</b>
                {info.industry && ` · ${info.industry}`}
              </span>
            )}
            {info.country && <span>{[info.city, info.country].filter(Boolean).join(", ")}</span>}
            {info.employees != null && <span>{info.employees.toLocaleString("tr-TR")} çalışan</span>}
            {website && (
              <a href={info.website} target="_blank" rel="noreferrer noopener">
                {website}
              </a>
            )}
            <span>Tür: {info.quoteType ?? "EQUITY"} · {info.currency ?? "USD"}</span>
          </div>
        </div>
        <div className="st-price">
          <b>{fmtPrice(analysis.price)}</b> <span className="muted">USD</span>
          <div className={signClass(analysis.changePct)}>{fmtPct(analysis.changePct)}</div>
          <div className="muted small">
            {info.marketState ? `${MARKET_STATE[info.marketState] ?? info.marketState} · ` : ""}son bar {barDate(analysis.asOf)}
          </div>
          {info.regularMarketTime && <div className="muted small">kotasyon {fmtDateTime(info.regularMarketTime)} (Dubai)</div>}
        </div>
      </div>

      <div className="st-gauges">
        <div className="st-main-gauge">
          <Gauge score={analysis.score} size={250} title="Toolun önerisi" />
        </div>
        <div className="st-sub-gauges">
          {GROUPS.map((g) => (
            <Gauge key={g} score={analysis.groups[g]} size={118} title={GROUP_LABEL[g]} showLabels={false} />
          ))}
        </div>
        <div className="st-call">
          <div className="kv big">
            <span>Sinyal kuvveti</span>
            <b>{analysis.strength} / 100</b>
          </div>
          <div className="kv big">
            <span>{analysis.rec === "hold" ? "Tahmini değişim" : buy ? "Tahmini kazanç" : "Tahmini düşüş"} ({HORIZON} işlem günü)</span>
            <b className={signClass(L.expectedPct)}>{fmtPct(L.expectedPct)}</b>
          </div>
          <div className="kv big">
            <span>Hedef fiyat (H2)</span>
            <b>{fmtPrice(L.targetPrice)}</b>
          </div>
          <p className="muted small">
            Piyasa rejimi: <b>{analysis.trendiness > 0.66 ? "trend" : analysis.trendiness < 0.33 ? "yatay / dalgalı" : "geçiş"}</b> (ADX ağırlığı %{Math.round(analysis.trendiness * 100)}).{" "}
            {cal.samples >= 20 && cal.hitRate != null ? (
              <>
                Son 5 yılda bu hissede benzer skor <b>{cal.samples}</b> gün görüldü; {HORIZON} gün sonra sinyal yönünde kapanış oranı <b>%{Math.round(cal.hitRate * 100)}</b>, ortalama getiri{" "}
                <b className={signClass(cal.avgFwdPct)}>{fmtPct(cal.avgFwdPct)}</b> (koşulsuz ortalama {fmtPct(cal.baseFwdPct)}).
              </>
            ) : (
              <>Geçmişte benzer skor az görüldü ({cal.samples} gün); projeksiyon volatilite modeline dayanıyor.</>
            )}
          </p>
        </div>
      </div>

      <div className="st-levels">
        <table className="perf">
          <thead>
            <tr>
              <th className="left">Fiyat noktası</th>
              <th>Fiyat</th>
              <th>Mevcut fiyata göre</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Hedef 3 (iyimser)", L.t3],
                ["Hedef 2 (beklenen)", L.t2],
                ["Hedef 1 (ihtiyatlı)", L.t1],
                ["Güncel fiyat", L.price],
                ["Zarar kes (stop)", L.stop],
              ] as [string, number][]
            ).map(([k, v]) => (
              <tr key={k} className={k === "Güncel fiyat" ? "hl" : ""}>
                <td className="left">{k}</td>
                <td>{fmtPrice(v)}</td>
                <td className={signClass(v - L.price)}>{k === "Güncel fiyat" ? "—" : fmtPct((v / L.price - 1) * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="kv-grid">
          <KV k="Risk / ödül (H2)" v={L.riskReward != null ? `1 : ${L.riskReward.toFixed(2)}` : "—"} />
          <KV k="ATR (14)" v={`${fmtPrice(L.atr)} (${L.atrPct.toFixed(2)}%)`} />
          <KV k="Günlük volatilite (60g)" v={`${L.volPct.toFixed(2)}%`} />
          <KV k="Destekler" v={L.supports.length ? L.supports.map((x) => fmtPrice(x)).join(" · ") : "—"} />
          <KV k="Dirençler" v={L.resistances.length ? L.resistances.map((x) => fmtPrice(x)).join(" · ") : "—"} />
          <KV k="Analist hedef ort." v={info.targetMeanPrice ? `${fmtPrice(info.targetMeanPrice)} (${fmtPct((info.targetMeanPrice / L.price - 1) * 100)})` : "—"} />
        </div>
      </div>
    </section>
  );
}

/** Volume, trend, indicator and fundamentals tables. */
export function StockTables({ detail, analysis }: { detail: StockDetail; analysis: Analysis }) {
  const info = detail.info;
  return (
    <>
      <div className="grid2 sig-grid2">
        <section className="panel">
          <div className="panel-head">
            <h2>İşlem hacmi & getiri</h2>
            <span className="muted small">RVOL (bugün / 20g ort.): <b>{analysis.rvol != null ? `${analysis.rvol.toFixed(2)}×` : "—"}</b></span>
          </div>
          <div className="table-wrap">
            <table className="perf">
              <thead>
                <tr>
                  <th className="left">Dönem</th>
                  <th>Ort. günlük hacim</th>
                  <th>Ort. günlük $ hacim</th>
                  <th>Toplam hacim</th>
                  <th title="Dönem ortalama hacmi / 1 yıllık ortalama">1Y ort.’ye göre</th>
                  <th>Getiri</th>
                </tr>
              </thead>
              <tbody>
                {analysis.volume.map((v) => (
                  <tr key={v.key}>
                    <td className="left">{v.label}</td>
                    <td>{fmtCompact(v.avgVolume)}</td>
                    <td>${fmtCompact(v.avgDollarVolume)}</td>
                    <td>{fmtCompact(v.totalVolume)}</td>
                    <td className={v.vs1Y != null ? (v.vs1Y >= 1.2 ? "up" : v.vs1Y <= 0.8 ? "down" : "") : ""}>{v.vs1Y != null ? `${v.vs1Y.toFixed(2)}×` : "—"}</td>
                    <td className={signClass(v.returnPct)}>{fmtPct(v.returnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="sub-h">Trend analizi</h3>
          <div className="table-wrap">
            <table className="perf">
              <thead>
                <tr>
                  <th className="left">Vade</th>
                  <th className="left">Durum</th>
                  <th title="Log-fiyat doğrusal regresyon eğimi, yıllıklandırılmış">Eğim (yıllık)</th>
                  <th title="Regresyon uyumu: 1'e yakın = düzenli trend">R²</th>
                  <th>Ort.’ya uzaklık</th>
                </tr>
              </thead>
              <tbody>
                {analysis.trend.map((t) => (
                  <tr key={t.key}>
                    <td className="left">{t.label}</td>
                    <td className={`left ${t.dir > 0 ? "up" : t.dir < 0 ? "down" : "flat"}`}>
                      {t.dir > 0 ? "▲" : t.dir < 0 ? "▼" : "■"} {t.label2}
                    </td>
                    <td className={signClass(t.slopePct)}>{fmtPct(t.slopePct, 1)}</td>
                    <td>{t.r2 != null ? t.r2.toFixed(2) : "—"}</td>
                    <td className={signClass(t.vsMaPct)}>{fmtPct(t.vsMaPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Teknik göstergeler</h2>
            <span className="muted small">{analysis.readings.length} gösterge · her biri −1 (sat) … +1 (al) oy verir</span>
          </div>
          <div className="table-wrap">
            <table className="perf ind">
              <thead>
                <tr>
                  <th className="left">Gösterge</th>
                  <th className="left">Değer</th>
                  <th>Oy</th>
                  <th className="left">Yorum</th>
                </tr>
              </thead>
              {GROUPS.map((g) => (
                <tbody key={g}>
                  <tr className="grp">
                    <td className="left" colSpan={2}>
                      {GROUP_LABEL[g]}
                    </td>
                    <td>
                      <ScoreBar value={analysis.groups[g]} />
                    </td>
                    <td className={`left ${signClass(analysis.groups[g])}`}>{analysis.groups[g] > 0 ? "+" : ""}{analysis.groups[g].toFixed(0)}</td>
                  </tr>
                  {analysis.readings
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <tr key={r.key}>
                        <td className="left">{r.label}</td>
                        <td className="left small">{r.value}</td>
                        <td>
                          <span className={`vote ${r.signal > 0.15 ? "up" : r.signal < -0.15 ? "down" : "flat"}`}>{r.signal > 0.15 ? "AL" : r.signal < -0.15 ? "SAT" : "NÖTR"}</span>
                        </td>
                        <td className="left small muted wrap">{r.note}</td>
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      </div>

      <Fundamentals info={info} detail={detail} price={analysis.price} />
    </>
  );
}

function Fundamentals({ info, detail, price }: { info: StockInfo; detail: StockDetail; price: number }) {
  const spread = info.bid && info.ask && info.ask > info.bid ? info.ask - info.bid : null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Temel veriler, Level-1 derinlik & analist görüşü</h2>
        <span className="muted small">
          Kaynak: {detail.source} (ücretsiz uç noktalar){detail.infoFetchedAt ? ` · çekildi ${fmtDateTime(detail.infoFetchedAt)}` : ""}
        </span>
      </div>
      <div className="fund-grid">
        <div>
          <h3 className="sub-h">Kotasyon & derinlik (Level 1)</h3>
          <KV k="Alış (bid) × adet" v={info.bid ? `${fmtPrice(info.bid)} × ${fmtCompact(info.bidSize ?? null, 0)}` : "—"} />
          <KV k="Satış (ask) × adet" v={info.ask ? `${fmtPrice(info.ask)} × ${fmtCompact(info.askSize ?? null, 0)}` : "—"} />
          <KV k="Alış-satış farkı" v={spread != null ? `${fmtPrice(spread)} (${((spread / price) * 100).toFixed(3)}%)` : "—"} />
          <KV k="Açılış" v={fmtPrice(info.regularMarketOpen)} />
          <KV k="Gün aralığı" v={info.regularMarketDayLow ? `${fmtPrice(info.regularMarketDayLow)} – ${fmtPrice(info.regularMarketDayHigh)}` : "—"} />
          <KV k="Önceki kapanış" v={fmtPrice(info.regularMarketPreviousClose)} />
          <KV k="Günlük hacim" v={fmtCompact(info.regularMarketVolume ?? null)} />
          <KV k="Seans öncesi" v={info.preMarketPrice ? `${fmtPrice(info.preMarketPrice)} (${fmtPct(info.preMarketChangePercent)})` : "—"} />
          <KV k="Seans sonrası" v={info.postMarketPrice ? `${fmtPrice(info.postMarketPrice)} (${fmtPct(info.postMarketChangePercent)})` : "—"} />
          <p className="muted small">Ücretsiz API’ler yalnızca en iyi alış/satış (Level 1) verir; tam emir defteri (Level 2) ücretli veri gerektirir.</p>
        </div>
        <div>
          <h3 className="sub-h">Değerleme</h3>
          <KV k="Piyasa değeri" v={usd(info.marketCap)} />
          <KV k="Firma değeri" v={usd(info.enterpriseValue)} />
          <KV k="F/K (son 12 ay)" v={num(info.trailingPE)} />
          <KV k="İleri F/K" v={num(info.forwardPE)} />
          <KV k="PEG" v={num(info.pegRatio)} />
          <KV k="PD/DD" v={num(info.priceToBook)} />
          <KV k="F/S" v={num(info.priceToSales)} />
          <KV k="HBK (12 ay / ileri)" v={`${num(info.eps)} / ${num(info.epsForward)}`} />
          <KV k="Temettü verimi" v={info.dividendYield ? `${pct(info.dividendYield)}${info.dividendRate ? ` ($${info.dividendRate.toFixed(2)})` : ""}` : "—"} />
          <KV k="Temettü hak kesim" v={date(info.exDividendDate)} />
        </div>
        <div>
          <h3 className="sub-h">Hisse yapısı & risk</h3>
          <KV k="Beta" v={num(info.beta)} />
          <KV k="Dolaşımdaki hisse" v={fmtCompact(info.sharesOutstanding ?? null)} />
          <KV k="Halka açık (float)" v={fmtCompact(info.floatShares ?? null)} />
          <KV k="Açığa satış / float" v={pct(info.shortPercentOfFloat)} />
          <KV k="Açığa satış oranı (gün)" v={num(info.shortRatio)} />
          <KV k="Kurumsal sahiplik" v={pct(info.heldByInstitutions, 1)} />
          <KV k="İçeriden sahiplik" v={pct(info.heldByInsiders, 1)} />
          <KV k="52 hafta aralığı" v={info.fiftyTwoWeekLow ? `${fmtPrice(info.fiftyTwoWeekLow)} – ${fmtPrice(info.fiftyTwoWeekHigh)}` : "—"} />
          <KV k="50 / 200 gün ort." v={info.fiftyDayAverage ? `${fmtPrice(info.fiftyDayAverage)} / ${fmtPrice(info.twoHundredDayAverage)}` : "—"} />
          <KV k="Ort. hacim 3A / 10G" v={`${fmtCompact(info.avgVolume3M ?? null)} / ${fmtCompact(info.avgVolume10D ?? null)}`} />
        </div>
        <div>
          <h3 className="sub-h">Finansallar & analistler</h3>
          <KV k="Gelir (12 ay)" v={usd(info.totalRevenue)} />
          <KV k="Gelir / kâr büyümesi" v={`${pct(info.revenueGrowth, 1)} / ${pct(info.earningsGrowth, 1)}`} />
          <KV k="Brüt / faaliyet / net marj" v={`${pct(info.grossMargins, 1)} / ${pct(info.operatingMargins, 1)} / ${pct(info.profitMargins, 1)}`} />
          <KV k="Özsermaye kârlılığı" v={pct(info.returnOnEquity, 1)} />
          <KV k="Borç / özsermaye" v={num(info.debtToEquity, 1)} />
          <KV k="Serbest nakit akışı" v={usd(info.freeCashflow)} />
          <KV k="Analist önerisi" v={info.recommendationKey ? `${REC_KEY_TR[info.recommendationKey] ?? info.recommendationKey}${info.recommendationMean ? ` (${info.recommendationMean.toFixed(2)})` : ""}` : (info.averageAnalystRating ?? "—")} />
          <KV k="Analist sayısı" v={info.analystCount ?? "—"} />
          <KV k="Hedef (düşük / ort. / yüksek)" v={info.targetMeanPrice ? `${fmtPrice(info.targetLowPrice)} / ${fmtPrice(info.targetMeanPrice)} / ${fmtPrice(info.targetHighPrice)}` : "—"} />
          <KV k="Sonraki bilanço" v={date(info.earningsDate)} />
        </div>
      </div>
      {info.summary && (
        <details className="biz">
          <summary>Şirket hakkında</summary>
          <p className="small">{info.summary}</p>
        </details>
      )}
      {detail.errors.length > 0 && <p className="muted small">Not: {detail.errors.join(" · ")}</p>}
      <p className="muted small">Model önerisi ({REC_LABEL.strong_buy} … {REC_LABEL.strong_sell}) yalnızca teknik verilere dayanır; temel veriler bilgi amaçlıdır ve skora katılmaz.</p>
    </section>
  );
}
