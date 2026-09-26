import { NextRequest, NextResponse } from "next/server";
import { getArbitrage } from "@/lib/server/arbitrage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fee = Number(req.nextUrl.searchParams.get("fee") ?? "0.1");
  const feePct = Number.isFinite(fee) && fee >= 0 && fee <= 1 ? fee : 0.1;
  return NextResponse.json(await getArbitrage(feePct));
}
