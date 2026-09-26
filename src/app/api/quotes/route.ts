import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/server/history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (!ids.length) return NextResponse.json({ error: "ids gerekli" }, { status: 400 });
  return NextResponse.json(await getQuotes(ids));
}
