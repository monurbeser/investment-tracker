"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SignalScan, StockDetail } from "@/lib/signals/types";
import { analyze, HORIZON, MIN_DOLLAR_VOLUME, MIN_PRICE, REC_THRESHOLDS } from "@/lib/signals/engine";
import { tradingViewSymbol } from "@/lib/signals/universe";
import { fetchScan, fetchStockDetail } from "@/lib/client/signalsApi";
import { STATIC } from "@/lib/client/api";
import { marketStatuses } from "@/lib/client/markets";
import type { Theme } from "@/lib/client/palette";
import { ago, DUBAI_TZ, fmtCompact, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { SignalCard } from "./SignalCard";
import { SignalChart } from "./SignalChart";
import { TradingViewWidget } from "./TradingViewWidget";
import { StockStatus, StockTables } from "./StockStatus";
import { StockTable } from "./StockTable";
import { RecBadge } from "./parts";

const STORE_KEY = "us-signals:v1";
type ChartTab = "signal" | "tv";

function loadSaved(): { theme?: Theme; tab?: ChartTab; symbol?: string } {
  try {
    const own = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const main = JSON.parse(localStorage.getItem("dxb-invest:v1") ?? "{}");
    return { theme: own.theme ?? main.theme, tab: own.tab, symbol: own.symbol };
  } catch {
    return {};
  }
}

export function SignalsApp() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [tab, setTab] = useState<ChartTab>("signal");
  const [scan, setScan] = useState<SignalScan | null>(null);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [loadingScan, setLoadingScan] = useState(true);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = loadSaved();
    if (s.theme) setTheme(s.theme);
    if (s.tab) setTab(s.tab);
    if (s.symbol) setSymbol(s.symbol);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ theme, tab, symbol }));
    } catch {
      /* storage unavailable */
    }
  }, [ready, theme, tab, symbol]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadScan = useCallback(async () => {
    setLoadingScan(true);
    try {
      const s = await fetchScan();
      setScan(s);
      setScanErr(null);
    } catch (e) {
      setScanErr((e as Error).message);
    } finally {
      setLoadingScan(false);
    }
  }, []);
  useEffect(() => {
    loadScan();
    const t = setInterval(loadScan, 5 * 60_000);
    return () => clearInterval(t);
  }, [loadScan]);

  // default selection: strongest buy signal
  useEffect(() => {
    if (ready && !symbol && scan) setSymbol(scan.buys[0]?.symbol ?? scan.rows[0]?.symbol ?? null);
  }, [ready, symbol, scan]);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    setLoadingDetail(true);
    setDetailErr(null);
    fetchStockDetail(symbol)
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && (setDetailErr(e.message), setDetail(null)))
      .finally(() => alive && setLoadingDetail(false));
    return () => {
      alive = false;
    };
  }, [symbol, scan?.generatedAt]);

  const analysis = useMemo(() => (detail && detail.symbol === symbol ? analyze(detail.bars) : null), [detail, symbol]);

  const select = (s: string) => {
    setSymbol(s);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const today = new Date(now).toLocaleDateString("tr-TR", { timeZone: "America/New_York", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const us = marketStatuses(new Date(now)).find((m) => m.key === "us")!;
  const b = scan?.breadth;
  const row = scan?.rows.find((r) => r.symbol === symbol) ?? scan?.benchmarks.find((r) => r.symbol === symbol);
  const exchange = detail?.info.fullExchangeName ?? row?.exchange ?? "";
  const demo = scan?.demo || detail?.demo;

  return (
    <div className="app sig-app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> US Sinyal Terminali
          {demo && <span className="demo">DEMO VERİ</span>}
        </div>
        <nav className="sig-nav">
          <Link href="/" className="navlink">
            ← DXB Invest Terminal
          </Link>
        </nav>
        <div className="markets">
          <span className="mkt" title={us.hours}>
            <i className={us.open ? "open" : "closed"} /> NYSE / NASDAQ <span className="muted">{us.open ? "açık" : "kapalı"}</span>
          </span>
          <span className="mkt">
            <span className="muted">{today} (New York) itibarıyla</span>
          </span>
        </div>
        <div className="top-right">
          {scan && (
            <span className="live" title={`Tarama ${new Date(scan.generatedAt).toLocaleString("tr-TR", { timeZone: DUBAI_TZ })} (Dubai) · ${scan.source}`}>
              <i className="on" />
              Tarama: {new Date(scan.generatedAt).toLocaleTimeString("tr-TR", { timeZone: DUBAI_TZ, hour: "2-digit", minute: "2-digit" })} ({ago(scan.generatedAt, now)})
            </span>
          )}
          <button type="button" className="icon-btn" onClick={loadScan} aria-label="Yenile" title="Taramayı yenile" disabled={loadingScan}>
            ↻
          </button>
          <button type="button" className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Tema değiştir" title="Tema">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="sig-main-col">
        {scanErr && !scan && <div className="panel down">Sinyal taraması alınamadı: {scanErr}</div>}
        {!scan && !scanErr && (
          <div className="panel pad muted">
            {STATIC ? "Tarama yükleniyor…" : "ABD hisseleri taranıyor (5 yıllık günlük veri, ~350 hisse). İlk tarama 30–90 sn sürebilir, sonra 15 dk önbellekte tutulur…"}
          </div>
        )}

        {scan && (
          <>
            <section className="regime">
              {scan.benchmarks.map((r) => (
                <button key={r.symbol} type="button" className="regime-item" onClick={() => select(r.symbol)} title={r.name}>
                  <div className="row-between">
                    <b>{r.symbol}</b>
                    <RecBadge rec={r.rec} small />
                  </div>
                  <div>
                    {fmtPrice(r.price)} <span className={`small ${signClass(r.changePct)}`}>{fmtPct(r.changePct)}</span>
                  </div>
                  <div className="muted small">skor {r.score > 0 ? "+" : ""}{r.score.toFixed(0)}</div>
                </button>
              ))}
              {b && (
                <div className="regime-item breadth">
                  <b>Piyasa genişliği</b>
                  <div className="small">
                    50g ort. üstü <b>%{Math.round((b.above50 / Math.max(1, b.total)) * 100)}</b> · 200g ort. üstü <b>%{Math.round((b.above200 / Math.max(1, b.total)) * 100)}</b>
                  </div>
                  <div className="small">
                    <span className="up">{b.buys} al</span> · <span className="muted">{b.holds} tut</span> · <span className="down">{b.sells} sat</span> · {b.advancers}↑ / {b.decliners}↓
                  </div>
                  <div className="muted small">
                    {scan.scanned} hisse tarandı{scan.discovered ? ` (${scan.discovered} tanesi bugünün tarayıcı listelerinden)` : ""}
                  </div>
                </div>
              )}
            </section>

            <div className="sig-lists">
              <section className="panel">
                <div className="panel-head">
                  <h2>
                    <span className="up">▲</span> AL sinyali veren 10 hisse
                  </h2>
                  <span className="muted small">sıralama: skor × kuvvet · min. ${fmtCompact(MIN_DOLLAR_VOLUME, 0)}/gün hacim, ${MIN_PRICE}+ fiyat</span>
                </div>
                <div className="card-grid">
                  {scan.buys.map((r, i) => (
                    <SignalCard key={r.symbol} row={r} rank={i + 1} active={symbol === r.symbol} onSelect={select} />
                  ))}
                  {!scan.buys.length && <div className="muted pad">Şu an eşiği geçen al sinyali yok.</div>}
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>
                    <span className="down">▼</span> SAT sinyali veren 10 hisse
                  </h2>
                  <span className="muted small">tahmini düşüş ve düşüş hedef fiyatları</span>
                </div>
                <div className="card-grid">
                  {scan.sells.map((r, i) => (
                    <SignalCard key={r.symbol} row={r} rank={i + 1} active={symbol === r.symbol} onSelect={select} />
                  ))}
                  {!scan.sells.length && <div className="muted pad">Şu an eşiği geçen sat sinyali yok.</div>}
                </div>
              </section>
            </div>
          </>
        )}

        <div ref={detailRef} className="detail-anchor" />
        {symbol && (
          <div className="detail-grid">
            <section className="panel chart-panel">
              <div className="panel-head">
                <h2>
                  {symbol} <span className="muted small">{detail?.info.longName ?? row?.name ?? ""} · {exchange}</span>
                </h2>
                <div className="seg" role="group" aria-label="Grafik">
                  <button type="button" className={tab === "signal" ? "on" : ""} onClick={() => setTab("signal")}>
                    Sinyal grafiği
                  </button>
                  <button type="button" className={tab === "tv" ? "on" : ""} onClick={() => setTab("tv")}>
                    TradingView (canlı)
                  </button>
                </div>
              </div>
              {tab === "tv" ? (
                <TradingViewWidget symbol={tradingViewSymbol(symbol, exchange)} theme={theme} />
              ) : detail && detail.symbol === symbol ? (
                <SignalChart bars={detail.bars} analysis={analysis} theme={theme} symbol={symbol} />
              ) : (
                <div className="empty">{loadingDetail ? "Veri yükleniyor…" : detailErr ?? ""}</div>
              )}
              <p className="muted small chart-note">
                {tab === "tv"
                  ? "TradingView gömülü grafiği: TradingView’in kendi verisi, tüm zaman aralıkları ve çizim araçları."
                  : `TradingView lightweight-charts · günlük mumlar (${detail?.source ?? "Yahoo Finance"}) · oklar modelin geçmiş Al/Sat geçişleri · kesikli çizgiler hedef ve stop seviyeleri.`}
              </p>
            </section>
            {analysis && detail ? (
              <StockStatus detail={detail} analysis={analysis} />
            ) : (
              <section className="panel pad muted">{loadingDetail ? "Durum hesaplanıyor…" : detailErr ?? (detail ? "Bu hisse için yeterli geçmiş veri yok (en az ~220 işlem günü gerekir)." : "")}</section>
            )}
          </div>
        )}
        {analysis && detail && <StockTables detail={detail} analysis={analysis} />}

        {scan && <StockTable scan={scan} selected={symbol} onSelect={select} />}

        <Methodology />

        {scan && scan.errors.length > 0 && <p className="muted small">Uyarılar: {scan.errors.join(" · ")}</p>}
        <p className="disclaimer muted small">
          {STATIC
            ? "GitHub Pages sürümü: tarama ve hisse verileri GitHub Actions ile ~15 dakikada bir Yahoo Finance’ten yenilenir; statik sürümde yalnızca taranan hisseler açılabilir. "
            : "Veriler sunucu üzerinden Yahoo Finance’ten çekilir; tarama 15 dk önbellekte tutulur. "}
          Veri kaynağı: Yahoo Finance (ücretsiz, gecikmeli olabilir), grafik: TradingView. Sinyaller istatistiksel bir modelin çıktısıdır; tahmini kazanç/düşüş ve hedef fiyatlar garanti değildir. Bu platform yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}

function Methodology() {
  return (
    <details className="panel method">
      <summary>
        <b>Karar algoritması nasıl çalışıyor?</b> <span className="muted small">— göstergeler, ağırlıklar, hedef fiyatlar</span>
      </summary>
      <div className="method-body small">
        <p>
          Gösterge seti, 2026’da swing/pozisyon işlemlerinde en yaygın kullanılan araçlardan seçildi: trend için EMA 20/50/200 dizilimi, SMA 50/200 (golden/death cross), MACD, ADX/DMI, Supertrend ve Ichimoku; momentum için
          RSI, Stokastik, CCI ve 3 aylık fiyat momentumu; hacim için OBV, Chaikin Money Flow, MFI, göreli hacim (RVOL) ve 20 günlük VWAP; volatilite/yapı için Bollinger bantları (sıkışma kırılımı dahil), Donchian 20 gün kırılımı ve 52
          haftalık konum.
        </p>
        <ol>
          <li>Her gösterge son günlük barda −1 (sat) ile +1 (al) arasında bir oy verir. Aşırı alım/satım bölgeleri (RSI, MFI, Stokastik, CCI) dönüş yönünde, trend göstergeleri trend yönünde oy verir.</li>
          <li>Oylar dört grupta ortalanır (Trend, Momentum, Hacim, Volatilite/Yapı) ve −100…+100 grup skorlarına çevrilir.</li>
          <li>
            Gruplar ADX’e göre ağırlıklandırılır: güçlü trendde (ADX ≥ 30) trend grubu %42, yatay piyasada (ADX ≤ 18) %30 ağırlık alır; yatay piyasada ortalamaya dönüş sinyalleri (Bollinger, momentum) daha etkilidir.
          </li>
          <li>
            Bileşik skor ≥ +{REC_THRESHOLDS.strong}: <b>Kuvvetli Al</b>, ≥ +{REC_THRESHOLDS.normal}: <b>Al</b>, −{REC_THRESHOLDS.normal}…+{REC_THRESHOLDS.normal}: <b>Tut</b>, ≤ −{REC_THRESHOLDS.normal}: <b>Sat</b>, ≤ −
            {REC_THRESHOLDS.strong}: <b>Kuvvetli Sat</b>.
          </li>
          <li>
            <b>Sinyal kuvveti</b> (0–100) = skorun büyüklüğü (%55) + göstergelerin aynı yönde oy verme oranı (%30) + hissenin kendi geçmişinde benzer skorlardan sonraki isabet oranı (%15).
          </li>
          <li>
            <b>Tahmini kazanç/düşüş</b> ({HORIZON} işlem günü ≈ 1 ay): skor × 60 günlük volatilitenin {HORIZON} güne ölçeklenmiş 1σ hareketi (volatilite modeli), hissenin son 5 yılında benzer skorlu günlerden sonraki
            ortalama {HORIZON} günlük getiriyle örneklem büyüklüğüne göre harmanlanır. Geçmiş, sinyalin tersini gösterirse tahmin küçültülür ama yönü çevrilmez.
          </li>
          <li>
            <b>Fiyat noktaları</b>: H1 = beklenen hareketin yarısı, H2 = beklenen hedef, H3 = 1,7× beklenen hareket veya yakındaki direnç/destek (pivot tepe/dipler, 52 hafta zirvesi, SMA200). Stop = Supertrend çizgisi ya da 2×ATR
            (hangisi fiyata yakınsa).
          </li>
          <li>İlk 10 listelerine yalnızca son 1 ay ortalama günlük işlem hacmi ${fmtCompact(MIN_DOLLAR_VOLUME, 0)} üzerinde ve fiyatı ${MIN_PRICE} üzerinde olan hisseler girer; sıralama |skor|×0,6 + kuvvet×0,4.</li>
        </ol>
        <p>
          Evren: NASDAQ, NYSE ve NYSE American’da işlem gören ~330 likit hisse + Yahoo’nun ABD tarayıcılarının (en aktifler, en çok yükselen/düşenler, küçük ölçekli yükselenler vb.) o gün listelediği tüm ABD borsalarındaki
          hisseler. Sunucu modunda arama kutusundan herhangi bir ABD hissesi açılabilir. Model geleceğe bakmaz: her gün yalnızca o güne kadarki verilerle puanlanır (birim testlerle doğrulanır).
        </p>
      </div>
    </details>
  );
}
