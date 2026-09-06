import { NextResponse } from "next/server";
import { getTreasuryBalance } from "@/lib/circle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const balance = await getTreasuryBalance();
  return NextResponse.json(balance);
}
