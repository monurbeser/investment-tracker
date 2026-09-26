# DXB Invest Terminal

Dubai’de yaşayan bir yatırımcı için çoklu varlık takip paneli: UAE borsaları (DFM/ADX), NASDAQ/NYSE, UAE bankaları üzerinden alınabilen ETF/fonlar, UAE devlet tahvilleri, Binance kripto paraları ve arbitraj/döviz fırsatları — TradingView tarzı arayüzle.

## Özellikler

- **Kayan üst bar:** endeksler, kripto, UAE hisseleri, ABD hisseleri (tıklayınca grafiğe eklenir, fiyat değişince yanıp söner).
- **Kayan alt bar:** AED kurları (USD/EUR/GBP/TRY/INR), altın/gümüş/Brent, USDT-yerel para primleri, en iyi üçgen arbitraj döngüleri, AED peg sapması.
- **Karma seçim:** UAE / US / ETF / Tahvil / Kripto sekmelerinden en fazla 8 enstrüman birlikte seçilir; arama kutusu Yahoo Finance ve Binance’te herhangi bir sembolü bulup ekler.
- **Grafikler (TradingView `lightweight-charts`):** 1H (1 hafta, 15–30 dk bar), 1A, 3A, 6A, 1Y, YTD, 5Y; `% Karşılaştır`, `Mum`, `Alan` modları; USD bazlı ya da yerel para birimi.
- **Performans tablosu:** tüm dönemler için getiri ısı haritası, son fiyat, son verinin zamanı ve kaynağı.
- **Sanal yatırım simülasyonu:** “Şu tarihte X USD koysaydım bugün ne olurdu?” — her enstrümana X USD ya da X USD’yi eşit bölerek karma portföy; bugünkü değer, K/Z, toplam ve yıllık getiri, maksimum düşüş, değer grafiği. Temettü/kupon dahil seçeneği.
- **Arbitraj & döviz:** Binance kripto-FX primi (USDT/TRY, USDT/BRL, EUR/USDT … vs resmi kur), Binance üçgen arbitrajı (ücret/bacak ayarlanabilir), USD/AED peg izleme.
- **Veri tazeliği:** her grafik ve satırda “son veri” zamanı (Dubai saati), kaç dakika önce olduğu, verinin sunucuya çekildiği an ve kaynak gösterilir. Kripto fiyatları tarayıcıda doğrudan Binance WebSocket’inden canlı akar; diğer kotasyonlar 15 sn’de bir yenilenir.

## Veri kaynakları

| Varlık | Kaynak | Not |
|---|---|---|
| DFM / ADX hisseleri | Yahoo Finance (`.AE` son eki) | AED → USD 3.6725 sabit kur |
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
- `npm test` — performans, simülasyon, tahvil modeli, arbitraj ve canlı-bar birleştirme birim testleri.
- `npm run build && npm start` — üretim.

> Binance, bazı bölgelerden (ör. ABD) `api.binance.com` erişimini engeller; sunucu bu durumda `data-api.binance.vision` uç noktasına düşer. BAE’den erişimde sorun beklenmez.

## Mimari

```
src/
  app/api/{quotes,history,search,arbitrage}   Next.js API rotaları (CORS’suz proxy + önbellek)
  lib/server/   yahoo.ts, binance.ts, bond.ts, fx.ts, arbitrage.ts, history.ts, cache.ts, demo.ts
  lib/          perf.ts (dönem getirileri, simülasyon, tahvil modeli), arbitrage.ts, live.ts, catalog.ts
  components/   Dashboard, TickerTape, Watchlist, TvChart, PerformanceTable, Simulator, ArbitragePanel
```

Seçimler, tema ve dönem tarayıcıda (`localStorage`) hatırlanır. Bu panel yatırım tavsiyesi değildir.
