import type { ArbitrageResponse, FxRate, PremiumRow } from "../types";
import { indexBooks, triangular, type Book } from "../arbitrage";
import { binanceBookTickers, binanceSymbols } from "./binance";
import { yahooQuote } from "./yahoo";
import { AED_PEG } from "./fx";
import { isDemo } from "./cache";

export const FX_PAIRS: { pair: string; label: string }[] = [
  { pair: "USDAED=X", label: "USD/AED" },
  { pair: "EURAED=X", label: "EUR/AED" },
  { pair: "GBPAED=X", label: "GBP/AED" },
  { pair: "AEDTRY=X", label: "AED/TRY" },
  { pair: "USDTRY=X", label: "USD/TRY" },
  { pair: "AEDINR=X", label: "AED/INR" },
  { pair: "EURUSD=X", label: "EUR/USD" },
  { pair: "GBPUSD=X", label: "GBP/USD" },
  { pair: "USDJPY=X", label: "USD/JPY" },
  { pair: "GC=F", label: "Altın (oz)" },
  { pair: "SI=F", label: "Gümüş (oz)" },
  { pair: "BZ=F", label: "Brent" },
];

const TRI_ASSETS = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "TRX", "LINK", "LTC", "DOT", "AVAX", "TON", "USDC", "FDUSD", "EUR", "TRY", "BRL"];
const PREMIUM_FIATS = ["TRY", "BRL", "ARS", "ZAR", "UAH", "PLN", "RON", "MXN", "COP", "JPY", "IDR", "CZK"];

export async function getArbitrage(feePct: number): Promise<ArbitrageResponse> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];

  if (isDemo()) return demoArbitrage(feePct, fetchedAt);

  const fxPromise = Promise.all(
    FX_PAIRS.map(async ({ pair, label }): Promise<FxRate | null> => {
      try {
        const { meta } = await yahooQuote(pair);
        const rate = meta.regularMarketPrice ?? NaN;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        return {
          pair,
          label,
          rate,
          changePct: prev ? (rate / prev - 1) * 100 : null,
          asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
        };
      } catch (e) {
        errors.push(`${label}: ${(e as Error).message}`);
        return null;
      }
    }),
  );

  let triangularRows: ArbitrageResponse["triangular"] = [];
  let premiums: PremiumRow[] = [];
  const fx = (await fxPromise).filter((x): x is FxRate => !!x);

  try {
    const [books, symbols] = await Promise.all([binanceBookTickers(), binanceSymbols()]);
    const meta = new Map(symbols.map((s) => [s.symbol, s]));
    const list: Book[] = [];
    for (const b of books) {
      const s = meta.get(b.symbol);
      if (s) list.push({ symbol: b.symbol, base: s.baseAsset, quote: s.quoteAsset, bid: +b.bidPrice, ask: +b.askPrice });
    }
    const idx = indexBooks(list);
    triangularRows = triangular(idx, "USDT", TRI_ASSETS, feePct);

    const officials = await Promise.all(
      PREMIUM_FIATS.map(async (f) => {
        const book = idx.get(`USDT/${f}`);
        if (!book) return null;
        try {
          const { meta } = await yahooQuote(`USD${f}=X`);
          const official = meta.regularMarketPrice;
          if (!official) return null;
          const mid = (book.bid + book.ask) / 2;
          return { fiat: f, binanceSymbol: book.symbol, binanceRate: mid, officialRate: official, premiumPct: (mid / official - 1) * 100 };
        } catch {
          return null;
        }
      }),
    );
    premiums = officials.filter((x): x is PremiumRow => !!x);
    const eur = idx.get("EUR/USDT");
    const eurusd = fx.find((r) => r.pair === "EURUSD=X");
    if (eur && eurusd?.rate) {
      const mid = (eur.bid + eur.ask) / 2;
      premiums.unshift({ fiat: "EUR", binanceSymbol: eur.symbol, binanceRate: mid, officialRate: eurusd.rate, premiumPct: (mid / eurusd.rate - 1) * 100 });
    }
    premiums.sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct));
  } catch (e) {
    errors.push(`Binance: ${(e as Error).message}`);
  }

  const usdAed = fx.find((r) => r.pair === "USDAED=X");
  return {
    triangular: triangularRows,
    premiums,
    peg: {
      official: AED_PEG,
      market: usdAed?.rate ?? null,
      deviationPct: usdAed?.rate ? (usdAed.rate / AED_PEG - 1) * 100 : null,
      asOf: usdAed?.asOf ?? null,
    },
    fx,
    feePct,
    fetchedAt,
    errors,
  };
}

function demoArbitrage(feePct: number, fetchedAt: string): ArbitrageResponse {
  const w = (k: number) => Math.sin(Date.now() / 9000 + k);
  return {
    triangular: [
      { path: ["USDT", "BTC", "ETH", "USDT"], symbols: ["BTCUSDT", "ETHBTC", "ETHUSDT"], grossPct: 0.05 + w(1) * 0.05, netPct: -0.25 + w(1) * 0.05 },
      { path: ["USDT", "BNB", "SOL", "USDT"], symbols: ["BNBUSDT", "SOLBNB", "SOLUSDT"], grossPct: 0.02 + w(2) * 0.04, netPct: -0.28 + w(2) * 0.04 },
    ],
    premiums: [
      { fiat: "TRY", binanceSymbol: "USDTTRY", binanceRate: 41.5 * (1 + 0.004 + w(3) * 0.002), officialRate: 41.5, premiumPct: 0.4 + w(3) * 0.2 },
      { fiat: "BRL", binanceSymbol: "USDTBRL", binanceRate: 5.5 * 1.006, officialRate: 5.5, premiumPct: 0.6 },
    ],
    peg: { official: AED_PEG, market: 3.6726, deviationPct: 0.003, asOf: fetchedAt },
    fx: FX_PAIRS.map(({ pair, label }, k) => ({ pair, label, rate: [3.6725, 4.3, 4.95, 11.3, 41.5, 23.9, 1.17, 1.35, 147, 3700, 44, 68][k] * (1 + w(k) * 0.001), changePct: w(k) * 0.4, asOf: fetchedAt })),
    feePct,
    fetchedAt,
    errors: [],
    demo: true,
  };
}
