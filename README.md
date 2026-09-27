# DXB Invest Terminal

Dubai’de yaşayan bir yatırımcı için çoklu varlık takip paneli: UAE borsası (DFM), NASDAQ/NYSE, UAE bankaları üzerinden alınabilen ETF/fonlar, UAE devlet tahvilleri, Binance kripto paraları ve arbitraj/döviz fırsatları — TradingView tarzı arayüzle.

## Özellikler

- **Kayan üst bar:** endeksler, kripto, UAE hisseleri, ABD hisseleri (tıklayınca grafiğe eklenir, fiyat değişince yanıp söner).
- **Kayan alt bar:** AED kurları (USD/EUR/GBP/TRY/INR), altın/gümüş/Brent, USDT-yerel para primleri, en iyi üçgen arbitraj döngüleri, AED peg sapması.
- **Karma seçim:** UAE / US / ETF / Tahvil / Kripto sekmelerinden en fazla 8 enstrüman birlikte seçilir; arama kutusu Yahoo Finance ve Binance’te herhangi bir sembolü bulup ekler.
- **Grafikler (TradingView `lightweight-charts`):** 1H (1 hafta, 15–30 dk bar), 1A, 3A, 6A, 1Y, YTD, 5Y; `% Karşılaştır`, `Mum`, `Alan` modları; USD bazlı ya da yerel para birimi.
- **Performans tablosu:** tüm dönemler için getiri ısı haritası, son fiyat, son verinin zamanı ve kaynağı.
- **Sanal yatırım simülasyonu:** “Şu tarihte X USD koysaydım bugün ne olurdu?” — her enstrümana X USD ya da X USD’yi eşit bölerek karma portföy; bugünkü değer, K/Z, toplam ve yıllık getiri, maksimum düşüş, değer grafiği. Temettü/kupon dahil seçeneği.
- **Arbitraj & döviz:** Binance kripto-FX primi (USDT/TRY, USDT/BRL, EUR/USDT … vs resmi kur), Binance üçgen arbitrajı (ücret/bacak ayarlanabilir), USD/AED peg izleme.
- **Veri tazeliği:** her grafik ve satırda “son veri” zamanı (Dubai saati), kaç dakika önce olduğu, verinin sunucuya çekildiği an ve kaynak gösterilir. Kripto fiyatları tarayıcıda doğrudan Binance WebSocket’inden canlı akar; diğer kotasyonlar 15 sn’de bir yenilenir.

## US Sinyal Terminali (`/signals`)

Ana panelden **“US Sinyaller →”** ile açılan ayrı sayfa: ABD borsalarındaki (NASDAQ, NYSE, NYSE American; Yahoo tarayıcıları üzerinden NYSE Arca / Cboe dahil tüm ABD borsaları) hisseler için teknik analiz tabanlı AL/SAT karar platformu.

- **Giriş ekranı:** güncel tarih itibarıyla **AL sinyali veren 10 hisse** ve **SAT sinyali veren 10 hisse** kartları — güncel fiyat, günlük değişim, 60 günlük mini grafik, sinyal kuvveti (0–100), 20 işlem günlük tahmini kazanç/düşüş, hedef fiyat ve fiyat noktaları (Stop · H1 · H2 · H3) haritası, $ hacim, RVOL, geçmiş isabet oranı. Üstte SPY/QQQ/DIA/IWM rejimi ve piyasa genişliği.
- **Grafik:** karta ya da listeden bir hisseye tıklayınca **TradingView lightweight-charts** mum grafiği (EMA 20/50/200, Bollinger, Supertrend, modelin geçmiş Al/Sat okları, hedef/stop çizgileri; alt panelde hacim, RSI, MACD veya sinyal skoru; 1A…5Y) ya da **TradingView gömülü canlı grafiği** (tüm zaman aralıkları, çizim araçları).
- **Durum ekranı:** sembol, tam ad, işlem gördüğü borsa, sektör/endüstri, ülke, çalışan sayısı; **Kuvvetli Sat · Sat · Tut · Al · Kuvvetli Al gauge**’u ve Trend / Momentum / Hacim / Volatilite alt gauge’ları; fiyat noktaları tablosu, risk/ödül, ATR, destek/dirençler; **5Y, 1Y, YTD, aylık, haftalık, günlük** ortalama hacim / $ hacim / toplam hacim / getiri tablosu; kısa-orta-uzun vade trend analizi (regresyon eğimi, R²); 18 göstergenin tek tek oyu; ücretsiz API’nin verdiği tüm temel veriler (Level-1 alış/satış × adet, spread, seans öncesi/sonrası, piyasa değeri, F/K, PEG, PD/DD, beta, float, açığa satış, kurumsal sahiplik, marjlar, analist hedefleri, bilanço tarihi …).
- **Hisse listesi:** taranan tüm hisseler; öneri/borsa/sektör filtresi, sıralama, arama. Sunucu modunda arama kutusundan tarama dışındaki herhangi bir ABD hissesi de açılabilir.

**Karar algoritması** (`src/lib/signals/engine.ts`): 2026’da en çok kullanılan göstergeler — EMA dizilimi, golden/death cross, MACD, ADX/DMI, Supertrend, Ichimoku, RSI, Stokastik, CCI, 3 aylık momentum, OBV, CMF, MFI, RVOL, VWAP, Bollinger (sıkışma kırılımı), Donchian, 52 hafta konumu — her biri −1…+1 oy verir; oylar dört grupta toplanır ve ADX rejimine göre ağırlıklandırılarak −100…+100 skora çevrilir (≥45 Kuvvetli Al, ≥15 Al, ±15 Tut, ≤−15 Sat, ≤−45 Kuvvetli Sat). Tahmini kazanç, skorla ölçeklenen volatilite hareketini hissenin son 5 yılında benzer skorlardan sonra görülen 20 günlük getirilerle harmanlar. Ayrıntılar sayfadaki “Karar algoritması nasıl çalışıyor?” bölümünde. Model geleceğe bakmaz (birim testlerle doğrulanır). **Yatırım tavsiyesi değildir.**

Veri: Yahoo Finance `v8/chart` (5 yıllık günlük OHLCV), `v7/quote` ve `v10/quoteSummary` (cookie + crumb; alınamazsa sayfa yalnızca grafik verisiyle çalışır), `v1/screener` (günün en aktif / en çok yükselen / düşen ABD hisseleri). Sunucu modunda tarama 15 dk önbellekte tutulur (ilk tarama ~350 hisse için 30–90 sn). GitHub Pages sürümünde tarama ve her hissenin detay JSON’u iş akışında ~15 dakikada bir üretilir; şirket profilleri yayındaki siteden 24 saat yeniden kullanılır. `DATA_MODE=demo` sentetik veriyle de çalışır.

## Veri kaynakları

| Varlık | Kaynak | Not |
|---|---|---|
| DFM hisseleri | Yahoo Finance (`.AE` son eki) | AED → USD 3.6725 sabit kur. ADX (Abu Dhabi) hisseleri Yahoo’da yok; ücretsiz kaynak bulunmadığından dahil edilmedi |
| NASDAQ / NYSE, endeksler | Yahoo Finance | |
| ETF / fonlar (UCITS dahil) | Yahoo Finance (`.L`, `.AS` …) | EUR/GBP → USD günlük kurla |
| Kripto | Binance Spot REST + WebSocket | `data-api.binance.vision` yedek uç nokta |
| Döviz, emtia | Yahoo Finance | |
| UAE devlet tahvilleri | **Model** | Aşağıya bakın |

**Tahviller hakkında:** Nasdaq Dubai / ADX’te işlem gören BAE federal, Abu Dhabi ve Dubai hükümeti tahvilleri/sukukları için ücretsiz canlı fiyat akışı yok. Bu nedenle panel, aynı vadeli ABD Hazine getirisi (^FVX/^TNX/^TYX, canlı) + ihraççı spreadi ile sabit vadeli **toplam getiri endeksi** hesaplar (kupon taşıma + süre/konvekslik etkisi). Spreadler `.env` ile ayarlanabilir. Ekranda “model” olarak etiketlidir.

## Çalıştırma

```bash
npm install
cp .env.example .env.local   # isteğe bağlı
npm run dev                  # http://localhost:3000
```

- `DATA_MODE=demo npm run dev` — internet erişimi olmadan arayüzü denemek için sentetik veri; ekranda **DEMO VERİ** rozeti görünür.
- `npm test` — performans, simülasyon, tahvil modeli, arbitraj, canlı-bar birleştirme, teknik gösterge ve sinyal motoru birim testleri.
- `npm run build && npm start` — üretim.

> Binance, bazı bölgelerden (ör. ABD) `api.binance.com` erişimini engeller; sunucu bu durumda `data-api.binance.vision` uç noktasına düşer. BAE’den erişimde sorun beklenmez.

## Online sürüm (GitHub Pages)

`.github/workflows/pages.yml` siteyi **https://monurbeser.github.io/investment-tracker/** adresine yayınlar:

- Kripto fiyatları, kripto grafikleri ve arbitraj tabloları tarayıcıdan **doğrudan Binance’ten canlı** gelir (REST + WebSocket).
- Yahoo Finance tarayıcıdan çağrılamadığı için (CORS) UAE/US hisseleri, ETF’ler, döviz ve tahvil modeli verileri iş akışı tarafından **~15 dakikada bir** çekilip JSON olarak yayınlanır; üst barda “Yahoo verisi: SS:DD (x dk önce)” rozeti bu zamanı gösterir. GitHub zamanlanmış işleri yoğunlukta gecikebilir.
- Statik sürümde arama yalnızca katalogdaki semboller ve Binance çiftleriyle sınırlıdır.
- İlk kurulumda bir kez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- GitHub, 60 gün boyunca commit olmayan depolarda zamanlanmış iş akışlarını durdurur; Actions sekmesinden yeniden etkinleştirilebilir.

Yerelde statik sürümü denemek: `npx tsx scripts/snapshot.ts public && ./scripts/build-static.sh` (çıktı `out/`).

## Mimari

```
src/
  app/api/{quotes,history,search,arbitrage}   Next.js API rotaları (CORS’suz proxy + önbellek)
  app/api/signals{,/detail,/search}           US sinyal taraması, hisse detayı, ABD hisse araması
  app/signals/  US Sinyal Terminali sayfası
  lib/server/   yahoo.ts, binance.ts, bond.ts, fx.ts, arbitrage.ts, history.ts, cache.ts, demo.ts
  lib/          perf.ts (dönem getirileri, simülasyon, tahvil modeli), arbitrage.ts, live.ts, catalog.ts
  lib/signals/  indicators.ts (gösterge serileri), engine.ts (karar algoritması), universe.ts, store.ts
  lib/server/usStocks.ts   Yahoo OHLCV / quote / quoteSummary / screener, tarama
  components/   Dashboard, TickerTape, Watchlist, TvChart, PerformanceTable, Simulator, ArbitragePanel
  components/signals/   SignalsApp, SignalCard, SignalChart, TradingViewWidget, StockStatus, StockTable, parts (gauge…)
```

Seçimler, tema ve dönem tarayıcıda (`localStorage`) hatırlanır. Bu panel yatırım tavsiyesi değildir.
