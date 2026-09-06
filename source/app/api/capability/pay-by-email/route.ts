import { NextRequest, NextResponse } from "next/server";
import { provisionEmbeddedWallet } from "@/lib/privy";
import { createTransfer, getTransferStatus } from "@/lib/circle";
import { createPayee, listPayees, updatePayeeStatus } from "@/lib/store";

/**
 * pay-by-email — the agent-callable capability this hackathon submission
 * exposes (X-Agent AI MCP Hackathon 2026, General Challenge track).
 *
 * "AI agents are only as useful as the capabilities they can reliably call."
 * This is Arcway's core capability — provision a stablecoin-payable wallet
 * for someone identified only by an email address, then pay them in USDC —
 * exposed as a single, synchronous, agent-callable endpoint with an
 * unambiguous JSON input/output schema, independent of the human dashboard
 * (POST /api/payees + POST /api/payouts) built for the ETHOnline submission.
 * Both entry points share the same underlying Privy + Circle logic in
 * lib/privy.ts and lib/circle.ts — this route is just a second, agent-facing
 * front door onto it, and every call here also lands in the same payee store
 * so it shows up in the human dashboard too.
 *
 * GET  -> returns this capability's machine-readable schema (what an agent,
 *         or a hackathon reviewer, needs to know to call it correctly).
 * POST -> executes one payment. Input: { payeeName, payeeEmail, amountUsdc }.
 *         Output: { status: "sent"|"failed"|"pending", walletAddress,
 *                    transferId, payeeId, errorMessage? }.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEMA = {
  name: "pay_by_email",
  description:
    "Pay a person or business a specified amount of USDC, identified only by their email address. If the recipient has no wallet, one is provisioned for them automatically (Privy embedded wallet) before the payment is sent — no wallet address, seed phrase, or prior crypto setup required from the recipient.",
  input_schema: {
    type: "object",
    required: ["payeeName", "payeeEmail", "amountUsdc"],
    properties: {
      payeeName: { type: "string", description: "Display name of the recipient." },
      payeeEmail: { type: "string", format: "email", description: "Recipient's email address. Used to look up or provision their embedded wallet." },
      amountUsdc: { type: "number", exclusiveMinimum: 0, description: "Amount to send, denominated in whole USDC (e.g. 25.5 = 25.50 USDC)." },
    },
  },
  output_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["sent", "failed", "pending"] },
      payeeId: { type: "string", description: "Internal id of the payee record created/updated by this call." },
      walletAddress: { type: "string", description: "The recipient's embedded wallet address that funds were sent to." },
      transferId: { type: "string", description: "Circle transfer id, if a transfer was created." },
      errorMessage: { type: "string", description: "Present only when status is \"failed\"." },
    },
  },
  example_request: {
    payeeName: "Ada Lovelace",
    payeeEmail: "ada@example.com",
    amountUsdc: 50,
  },
};

export async function GET() {
  return NextResponse.json(SCHEMA);
}

export async function POST(request: NextRequest) {
  let body: { payeeName?: unknown; payeeEmail?: unknown; amountUsdc?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payeeName = typeof body.payeeName === "string" ? body.payeeName.trim() : "";
  const payeeEmail = typeof body.payeeEmail === "string" ? body.payeeEmail.trim() : "";
  const amountUsdc = Number(body.amountUsdc);

  if (!payeeName) {
    return NextResponse.json({ error: "payeeName is required." }, { status: 400 });
  }
  if (!payeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payeeEmail)) {
    return NextResponse.json({ error: "A valid payeeEmail is required." }, { status: 400 });
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return NextResponse.json({ error: "amountUsdc must be a positive number." }, { status: 400 });
  }

  try {
    // 1. Provision (or reuse) the recipient's embedded wallet — no action
    //    required from them.
    const wallet = await provisionEmbeddedWallet(payeeEmail);

    // 2. Record the payee so this call shows up in the dashboard too,
    //    keeping both submission entry points backed by one shared system.
    const existing = (await listPayees()).find(
      (p) => p.email.toLowerCase() === payeeEmail.toLowerCase()
    );
    const payee = existing
      ? existing
      : await createPayee({ name: payeeName, email: payeeEmail, amountUsdc }, wallet.address);

    await updatePayeeStatus(payee.id, "sending");

    // 3. Execute the USDC transfer via Circle (Arc), then resolve its final
    //    state before responding, so a caller gets a definitive answer in
    //    one round trip.
    const created = await createTransfer({
      destinationAddress: wallet.address,
      amountUsdc,
    });

    if (created.status === "failed") {
      await updatePayeeStatus(payee.id, "failed", {
        failureReason: created.errorMessage ?? "Transfer creation failed.",
      });
      return NextResponse.json(
        {
          status: "failed",
          payeeId: payee.id,
          walletAddress: wallet.address,
          errorMessage: created.errorMessage ?? "Transfer creation failed.",
        },
        { status: 502 }
      );
    }

    const final = await getTransferStatus(created.transferId);
    const status = final.status === "complete" ? "sent" : final.status === "failed" ? "failed" : "pending";

    await updatePayeeStatus(payee.id, status === "sent" ? "sent" : status === "failed" ? "failed" : "sending", {
      transferId: created.transferId,
      failureReason: final.errorMessage,
    });

    return NextResponse.json({
      status,
      payeeId: payee.id,
      walletAddress: wallet.address,
      transferId: created.transferId,
      errorMessage: final.errorMessage,
    });
  } catch (err) {
    console.error("pay-by-email capability failed:", err);
    return NextResponse.json(
      { status: "failed", errorMessage: err instanceof Error ? err.message : "Unknown error." },
      { status: 500 }
    );
  }
}
