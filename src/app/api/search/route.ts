import { NextRequest, NextResponse } from "next/server";
import { CATALOG, makeId } from "@/lib/catalog";
import { yahooSearch } from "@/lib/server/yahoo";
import { binanceSymbols } from "@/lib/server/binance";
import { isDemo } from "@/lib/server/cache";
import type { SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [], errors: [] });
  const Q = q.toUpperCase();
  const errors: string[] = [];

  const local: SearchResult[] = CATALOG.filter((i) => i.symbol.toUpperCase().includes(Q) || i.name.toUpperCase().includes(Q)).map(
    ({ id, symbol, name, exchange, category, source, currency }) => ({ id, symbol, name, exchange, category, source, currency }),
  );
  if (isDemo()) return NextResponse.json({ results: local, errors });

  const [yahoo, crypto] = await Promise.all([
    yahooSearch(q).catch((e) => (errors.push(`Yahoo: ${(e as Error).message}`), [] as SearchResult[])),
    binanceSymbols()
      .then((syms) =>
        syms
          .filter((s) => s.quoteAsset === "USDT" && (s.baseAsset === Q || (Q.length >= 2 && s.baseAsset.startsWith(Q))))
          .slice(0, 8)
          .map(
            (s): SearchResult => ({
              id: makeId("binance", s.symbol),
              symbol: s.symbol,
              name: `${s.baseAsset} / USDT`,
              exchange: "Binance",
              type: "Kripto",
              category: "crypto",
              source: "binance",
              currency: "USDT",
            }),
          ),
      )
      .catch((e) => (errors.push(`Binance: ${(e as Error).message}`), [] as SearchResult[])),
  ]);

  const seen = new Set<string>();
  const results = [...local, ...crypto, ...yahoo].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, 25);
  return NextResponse.json({ results, errors });
}
