/**
 * Fetches everything the browser cannot fetch itself (Yahoo Finance has no
 * CORS) and writes static JSON for the GitHub Pages build.
 * Binance data is NOT snapshotted: the static site reads it live in the browser.
 *
 *   npx tsx scripts/snapshot.ts [outDir=public]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG, TICKER_TOP } from "../src/lib/catalog";
import { getHistory, getQuotes } from "../src/lib/server/history";
import { getFxRates, getOfficials } from "../src/lib/server/arbitrage";
import { compactBars, historyPath, type FxSnapshot, type QuotesSnapshot, type StoredHistory } from "../src/lib/snapshot";
import type { Instrument, Resolution } from "../src/lib/types";
import { getStockDetail, runScan } from "../src/lib/server/usStocks";
import { detailPath, packDetail, SCAN_PATH, type StoredDetail } from "../src/lib/signals/store";

const out = process.argv[2] ?? "public";

async function write(rel: string, data: unknown) {
  const file = path.join(out, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
  }));
}

async function main() {
  const started = Date.now();
  const insts = CATALOG.filter((i) => i.source !== "binance");
  const jobs: [Instrument, Resolution][] = insts.flatMap((i) => (i.source === "bond" ? [[i, "daily"]] : [[i, "daily"], [i, "intraday"]]) as [Instrument, Resolution][]);
  let ok = 0;
  const failed: string[] = [];

  await pool(jobs, 3, async ([inst, res]) => {
    try {
      const h = await getHistory(inst, res);
      const bars = compactBars(h.bars);
      const same = h.usd.length === h.bars.length && h.usd.every((b, k) => b.close === h.bars[k].close);
      const stored: StoredHistory = { ...h, bars, usd: same ? undefined : compactBars(h.usd) };
      await write(historyPath(inst.id, res), stored);
      ok++;
    } catch (e) {
      failed.push(`${inst.id} (${res}): ${(e as Error).message}`);
    }
  });

  const quoteIds = Array.from(new Set([...insts.map((i) => i.id), ...TICKER_TOP.filter((id) => !id.startsWith("binance:"))]));
  const q = await getQuotes(quoteIds);
  await write("data/quotes.json", { quotes: q.quotes, errors: q.errors, fetchedAt: q.fetchedAt } satisfies QuotesSnapshot);

  const errors: string[] = [];
  const [fx, officials] = await Promise.all([getFxRates(errors), getOfficials()]);
  await write("data/fx.json", { fx, officials, fetchedAt: new Date().toISOString(), errors } satisfies FxSnapshot);

  const sig = await snapshotSignals().catch((e) => (console.log(`signals failed: ${(e as Error).message}`), null));

  console.log(`snapshot: ${ok}/${jobs.length} histories, ${Object.keys(q.quotes).length}/${quoteIds.length} quotes, ${fx.length} fx rates in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (failed.length) console.log(`failed:\n  ${failed.join("\n  ")}`);
  if (sig) console.log(`signals: ${sig}`);
  if (!ok && !Object.keys(q.quotes).length) {
    console.error("No data could be fetched from Yahoo Finance.");
    process.exit(1);
  }
}

main();

/**
 * US signal platform: universe scan + one detail file per stock. Company
 * profiles (quoteSummary) change slowly, so they are reused from the currently
 * deployed site (PREVIOUS_SITE) for 24h and only a limited number is refreshed
 * per run to stay gentle with Yahoo.
 */
const PROFILE_TTL_MS = 24 * 3600_000;
const PROFILE_FETCHES_PER_RUN = 60;

async function previousDetail(symbol: string): Promise<StoredDetail | null> {
  const base = process.env.PREVIOUS_SITE;
  if (!base) return null;
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/${detailPath(symbol)}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as StoredDetail) : null;
  } catch {
    return null;
  }
}

async function snapshotSignals(): Promise<string> {
  const { scan, daily } = await runScan({ concurrency: 4, log: (m) => console.log(m) });
  await write(SCAN_PATH, scan);
  const priority = new Set([...scan.buys, ...scan.sells].map((r) => r.symbol));
  const symbols = [...daily.keys()].sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
  let fresh = 0;
  let reused = 0;
  let written = 0;
  await pool(symbols, 4, async (symbol) => {
    try {
      const prev = await previousDetail(symbol);
      const age = prev?.infoFetchedAt ? Date.now() - new Date(prev.infoFetchedAt).getTime() : Infinity;
      const refresh = age > PROFILE_TTL_MS && fresh < PROFILE_FETCHES_PER_RUN;
      if (refresh) fresh++;
      else if (prev) reused++;
      const detail = await getStockDetail(symbol, {
        daily: daily.get(symbol),
        profile: refresh ? undefined : { info: prev?.info ?? {}, fetchedAt: prev?.infoFetchedAt ?? null },
      });
      await write(detailPath(symbol), packDetail(detail));
      written++;
    } catch (e) {
      console.log(`  detail ${symbol}: ${(e as Error).message}`);
    }
  });
  return `${scan.scanned} scanned, ${scan.buys.length} buys / ${scan.sells.length} sells, ${written} details (${fresh} profiles fetched, ${reused} reused)`;
}
