import { NextRequest, NextResponse } from "next/server";
import { provisionEmbeddedWallet } from "@/lib/privy";
import { createPayee, listPayees } from "@/lib/store";
import type { NewPayeeInput } from "@/lib/types";

// This route reads/writes a local JSON file and must run on the Node.js
// runtime (not the Edge runtime), and should never be statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payees = await listPayees();
  return NextResponse.json({ payees });
}

export async function POST(request: NextRequest) {
  let body: Partial<NewPayeeInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body.name?.toString().trim();
  const email = body.email?.toString().trim();
  const amountUsdc = Number(body.amountUsdc);

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return NextResponse.json(
      { error: "Amount must be a positive number." },
      { status: 400 }
    );
  }

  try {
    // Provision the payee's embedded wallet via Privy the moment they're
    // added — this is what lets us send them USDC before they've ever
    // opened the app or installed a wallet.
    const wallet = await provisionEmbeddedWallet(email);
    const payee = await createPayee({ name, email, amountUsdc }, wallet.address);
    return NextResponse.json({ payee, walletMocked: wallet.mocked }, { status: 201 });
  } catch (err) {
    console.error("Failed to create payee:", err);
    return NextResponse.json(
      { error: "Failed to provision an embedded wallet for this payee." },
      { status: 502 }
    );
  }
}
