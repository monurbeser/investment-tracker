import { NextResponse } from "next/server";
import { getSignalScan } from "@/lib/server/usStocks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json(await getSignalScan());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
