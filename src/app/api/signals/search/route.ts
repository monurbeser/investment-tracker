import { NextRequest, NextResponse } from "next/server";
import { searchUs } from "@/lib/server/usStocks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchUs(q) });
  } catch (e) {
    return NextResponse.json({ results: [], error: (e as Error).message });
  }
}
