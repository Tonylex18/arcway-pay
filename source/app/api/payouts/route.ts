import { NextResponse } from "next/server";
import { createTransfer, getTransferStatus } from "@/lib/circle";
import { listPayees, updatePayeeStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Triggers a USDC payout for every currently-pending payee.
 *
 * For each pending payee this: marks them "sending" -> asks lib/circle.ts to
 * create a transfer -> waits for it to settle -> marks them "sent" or
 * "failed". Payouts run concurrently across payees but are awaited here so
 * the response reflects final status, which keeps the dashboard's UI simple
 * (call the endpoint, then refetch the payee list). For a larger payee list
 * this would move to a background job / webhook-driven status updates
 * instead of an in-request wait loop.
 */
export async function POST() {
  const payees = await listPayees();
  const pending = payees.filter((p) => p.status === "pending" || p.status === "failed");

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, payees: await listPayees() });
  }

  await Promise.all(
    pending.map(async (payee) => {
      await updatePayeeStatus(payee.id, "sending");

      try {
        const created = await createTransfer({
          destinationAddress: payee.walletAddress,
          amountUsdc: payee.amountUsdc,
        });

        if (created.status === "failed") {
          await updatePayeeStatus(payee.id, "failed", {
            failureReason: created.errorMessage ?? "Transfer creation failed.",
          });
          return;
        }

        // Poll once for a final state. In mock mode this resolves quickly;
        // against the real Circle API you'd typically poll on an interval
        // or, better, listen for Circle's webhook notification instead.
        const final = await getTransferStatus(created.transferId);

        if (final.status === "complete") {
          await updatePayeeStatus(payee.id, "sent", { transferId: created.transferId });
        } else {
          await updatePayeeStatus(payee.id, "failed", {
            transferId: created.transferId,
            failureReason: final.errorMessage ?? "Transfer did not complete.",
          });
        }
      } catch (err) {
        console.error(`Payout failed for payee ${payee.id}:`, err);
        await updatePayeeStatus(payee.id, "failed", {
          failureReason: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    })
  );

  const updated = await listPayees();
  return NextResponse.json({ processed: pending.length, payees: updated });
}
