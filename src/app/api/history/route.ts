import { NextRequest, NextResponse } from "next/server";
import { resolveInstrument } from "@/lib/catalog";
import { getHistory } from "@/lib/server/history";
import type { Resolution } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const res = (req.nextUrl.searchParams.get("res") === "intraday" ? "intraday" : "daily") as Resolution;
  const inst = resolveInstrument(id);
  if (!inst) return NextResponse.json({ error: "Bilinmeyen enstrüman" }, { status: 400 });
  try {
    return NextResponse.json(await getHistory(inst, res));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, fetchedAt: new Date().toISOString() }, { status: 502 });
  }
}
