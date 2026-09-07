import { NextResponse } from "next/server";
import { authErrorResponse, requireEmployer } from "@/lib/auth";
import { createTransfer, getTransferStatus } from "@/lib/circle";
import {
  createPayout,
  listPayees,
  listPayouts,
  listPayoutsByIds,
  updatePayeeStatus,
  updatePayoutStatus,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The payout ledger, newest first — what the Activity tab reads. */
export async function GET(request: Request) {
  try {
    const { company } = await requireEmployer(request);
    return NextResponse.json({ payouts: await listPayouts(company.id) });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("Failed to list payouts:", err);
    return NextResponse.json({ error: "Could not load activity." }, { status: 500 });
  }
}

/**
 * Executes a payout run.
 *
 * For each queued payee this opens a `Payout` ledger row *before* attempting
 * anything, then marks the payee "sending" -> creates a Circle transfer ->
 * waits for it to settle -> writes the terminal status to both the ledger row
 * and the payee. Opening the row first means a crash mid-run still leaves a
 * record of what was intended, rather than money moving with nothing to show
 * for it.
 *
 * The response carries the ids of the rows this run wrote, which is what the
 * receipt screen reads back.
 *
 * Accepts an optional `{ payeeIds: string[] }` body so the review gate can
 * hold back specific recipients; with no body, every queued payee is paid.
 */
export async function POST(request: Request) {
  let company;
  try {
    ({ company } = await requireEmployer(request));
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  let requestedIds: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.payeeIds)) {
      requestedIds = body.payeeIds.filter((id: unknown) => typeof id === "string");
    }
  } catch {
    // No body is the normal case — pay everything queued.
  }

  const payees = await listPayees(company.id);
  const queued = payees.filter(
    (p) =>
      (p.status === "pending" || p.status === "failed") &&
      (requestedIds === null || requestedIds.includes(p.id))
  );

  if (queued.length === 0) {
    return NextResponse.json({ processed: 0, payoutIds: [], payees: await listPayees(company.id) });
  }

  const payoutIds = await Promise.all(
    queued.map(async (payee) => {
      const payout = await createPayout(company.id, payee.id, payee.amountUsdc);
      await updatePayeeStatus(company.id, payee.id, "sending");

      try {
        const created = await createTransfer({
          destinationAddress: payee.walletAddress,
          amountUsdc: payee.amountUsdc,
        });

        if (created.status === "failed") {
          const reason = created.errorMessage ?? "Transfer creation failed.";
          await updatePayoutStatus(company.id, payout.id, "failed", { failureReason: reason });
          await updatePayeeStatus(company.id, payee.id, "failed", { failureReason: reason });
          return payout.id;
        }

        // Poll once for a final state. In mock mode this resolves quickly;
        // against the real Circle API this moves to webhooks (Phase 3).
        const final = await getTransferStatus(created.transferId);

        if (final.status === "complete") {
          await updatePayoutStatus(company.id, payout.id, "sent", { transferId: created.transferId });
          await updatePayeeStatus(company.id, payee.id, "sent", { transferId: created.transferId });
        } else {
          const reason = final.errorMessage ?? "Transfer did not complete.";
          await updatePayoutStatus(company.id, payout.id, "failed", {
            transferId: created.transferId,
            failureReason: reason,
          });
          await updatePayeeStatus(company.id, payee.id, "failed", {
            transferId: created.transferId,
            failureReason: reason,
          });
        }
      } catch (err) {
        console.error(`Payout failed for payee ${payee.id}:`, err);
        const reason = err instanceof Error ? err.message : "Unknown error.";
        await updatePayoutStatus(company.id, payout.id, "failed", { failureReason: reason });
        await updatePayeeStatus(company.id, payee.id, "failed", { failureReason: reason });
      }

      return payout.id;
    })
  );

  return NextResponse.json({
    processed: queued.length,
    payoutIds,
    payouts: await listPayoutsByIds(company.id, payoutIds),
    payees: await listPayees(company.id),
  });
}
