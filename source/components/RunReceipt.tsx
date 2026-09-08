"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClasses, Chip, Eyebrow } from "@/components/ui";
import { ResendNotification } from "@/components/ResendNotification";
import type { Payout } from "@/lib/types";
import { formatUsdc, truncateAddress } from "@/lib/utils";

/**
 * A payout run's receipt.
 *
 * Shared by the screen shown immediately after confirming a run and by the
 * permalink at /dashboard/runs/<id>, so what you see on camera later is
 * byte-for-byte what you saw at the time.
 */
export function RunReceipt({
  payouts: initial,
  heading,
  subheading,
}: {
  payouts: Payout[];
  heading?: string;
  subheading?: string;
}) {
  const [payouts, setPayouts] = useState<Payout[]>(initial);

  const settled = payouts.filter((p) => p.status === "sent");
  const failedNotices = payouts.filter((p) => p.notifyStatus === "failed");
  const total = payouts.reduce((sum, p) => sum + p.amountUsdc, 0);

  function downloadReceipt() {
    const header = "name,email,wallet,amount_usdc,status,transaction_hash,sent_at,notified";
    const rows = payouts.map((p) =>
      [
        p.payeeName,
        p.payeeEmail,
        p.walletAddress,
        p.amountUsdc.toFixed(2),
        p.status,
        p.transferId ?? "",
        p.sentAt ?? "",
        p.notifyStatus,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arcway-receipt-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-ink">
        {heading ?? `${settled.length} payment${settled.length === 1 ? "" : "s"} sent`}
      </h1>
      <p className="mt-3 text-[15px] text-ink-soft">
        {subheading ??
          `${formatUsdc(total)} USDC across ${payouts.length} recipient${
            payouts.length === 1 ? "" : "s"
          }. Every line has a receipt.`}
      </p>

      {failedNotices.length > 0 && (
        <div className="mt-6 rounded-card border border-amber-100 bg-amber-50 p-5">
          <div className="text-[13px] font-semibold text-amber-text">
            {failedNotices.length} notification
            {failedNotices.length === 1 ? "" : "s"} could not be sent
          </div>
          <p className="mt-2 text-[14px] leading-[1.6] text-amber-text">
            The money moved regardless — these people simply have not been told
            yet. Retry any of them below.
          </p>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-card border border-line bg-card">
        <ul>
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft px-5 py-4 last:border-0"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink">{p.payeeName}</div>
                <div className="text-[13px] text-ink-mute">{p.payeeEmail}</div>
                <div className="mt-1 font-mono text-[12px] text-ink-mute">
                  {p.transferId ? truncateAddress(p.transferId, 6) : "No transaction hash"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <ResendNotification
                  payoutId={p.id}
                  notifyStatus={p.notifyStatus}
                  notifiedAt={p.notifiedAt}
                  attempts={p.notifyAttempts}
                  onUpdated={(updated) =>
                    setPayouts((prev) =>
                      prev.map((row) => (row.id === p.id ? (updated as Payout) : row))
                    )
                  }
                />
                <ReceiptChip payout={p} />
                <div className="text-right font-medium text-ink">
                  {formatUsdc(p.amountUsdc)} <span className="text-ink-mute">USDC</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={downloadReceipt} className={buttonClasses("primary", "lg")}>
          Download receipt
        </button>
        <Link href="/dashboard" className={buttonClasses("secondary", "lg")}>
          Back to payouts
        </Link>
      </div>

      {/* A div, not a p: Eyebrow renders a block element, and a <div> inside a
          <p> is invalid HTML that React reports as a hydration error. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-mute">
        <Eyebrow>Permalink</Eyebrow>
        <Link
          href={`/dashboard/runs/${payouts[0]?.runId ?? ""}`}
          className="text-emerald underline underline-offset-2"
        >
          /dashboard/runs/{payouts[0]?.runId ?? ""}
        </Link>
      </div>
    </>
  );
}

/**
 * Settlement and claim state are two different things, and a row can fail at
 * either. A transfer that never left is "Failed"; one that landed in a wallet
 * nobody has signed into yet is "Unclaimed" — the money is theirs, waiting.
 * Only a landed transfer into a claimed wallet is fully "Settled".
 */
function ReceiptChip({ payout }: { payout: Payout }) {
  if (payout.status === "failed") return <Chip tone="amber">Failed</Chip>;
  if (payout.status !== "sent") return <Chip tone="neutral">Pending</Chip>;
  return payout.claimed ? (
    <Chip tone="emerald">Settled</Chip>
  ) : (
    <Chip tone="amber">Unclaimed</Chip>
  );
}
