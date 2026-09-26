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

  console.log(`snapshot: ${ok}/${jobs.length} histories, ${Object.keys(q.quotes).length}/${quoteIds.length} quotes, ${fx.length} fx rates in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (failed.length) console.log(`failed:\n  ${failed.join("\n  ")}`);
  if (!ok && !Object.keys(q.quotes).length) {
    console.error("No data could be fetched from Yahoo Finance.");
    process.exit(1);
  }
}

main();
