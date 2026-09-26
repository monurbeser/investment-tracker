import type { Bar, BondIssuer, BondSpec } from "../types";
import { yahooHistory } from "./yahoo";
import { yieldToTotalReturnIndex } from "../perf";

const DEFAULT_SPREAD_BP: Record<BondIssuer, number> = { UAE_FED: 45, ABU_DHABI: 50, DUBAI: 110 };
const ENV_KEY: Record<BondIssuer, string> = {
  UAE_FED: "BOND_SPREAD_UAE_FED_BP",
  ABU_DHABI: "BOND_SPREAD_ABU_DHABI_BP",
  DUBAI: "BOND_SPREAD_DUBAI_BP",
};

export function spreadBp(issuer: BondIssuer): number {
  const v = Number(process.env[ENV_KEY[issuer]]);
  return Number.isFinite(v) && process.env[ENV_KEY[issuer]] !== undefined ? v : DEFAULT_SPREAD_BP[issuer];
}

export interface BondModel {
  bars: Bar[];
  yieldPct: number;
  lastDataAt: number | null;
  note: string;
}

/**
 * No free live feed exists for Nasdaq Dubai / ADX-listed UAE sovereign paper, so the
 * bond is modelled as a constant-maturity total-return index: live US Treasury
 * yield of the same tenor + issuer credit spread. Coupon carry is included.
 */
export async function bondModel(spec: BondSpec): Promise<BondModel> {
  const bench = (await yahooHistory(spec.benchmark, "daily")).bars;
  const spread = spreadBp(spec.issuer) / 10000;
  const yields = bench.filter((b) => b.close > 0).map((b) => ({ time: b.time, y: b.close / 100 + spread }));
  const bars = yieldToTotalReturnIndex(yields, spec.tenorYears, 100);
  const last = yields[yields.length - 1];
  return {
    bars,
    yieldPct: last ? last.y * 100 : NaN,
    lastDataAt: last?.time ?? null,
    note: `Model: ${spec.benchmark.replace("^", "")} (ABD Hazine ${spec.tenorYears}Y) + ${spreadBp(spec.issuer)} bp spread, sabit vadeli toplam getiri endeksi (kupon dahil). Nasdaq Dubai/ADX tahvilleri için ücretsiz canlı fiyat yok.`,
  };
}
