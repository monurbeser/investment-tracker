import { NextRequest, NextResponse } from "next/server";
import { getStockDetail } from "@/lib/server/usStocks";
import { isValidUsSymbol } from "@/lib/signals/universe";
import { UpstreamError } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!isValidUsSymbol(symbol)) return NextResponse.json({ error: "Geçersiz sembol" }, { status: 400 });
  try {
    return NextResponse.json(await getStockDetail(symbol));
  } catch (e) {
    const status = e instanceof UpstreamError && (e.status === 404 || e.status === 400) ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
