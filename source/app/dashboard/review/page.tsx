"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isQueued } from "@/components/StatusBadge";
import { buttonClasses, Chip, Eyebrow } from "@/components/ui";
import type { Payee, Payout } from "@/lib/types";
import { cn, formatUsdc, truncateAddress } from "@/lib/utils";

/**
 * The confirmation gate.
 *
 * Money must not move on a single click, so this screen exists between the
 * dashboard and the transfer: it restates who is being paid, how much in
 * total, what the treasury looks like afterwards, and which recipients have
 * not yet claimed their wallet. Nothing is sent until the button carrying the
 * real total is pressed.
 */
export default function ReviewPage() {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [treasury, setTreasury] = useState<{ amountUsdc: number; mocked: boolean } | null>(null);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Payout[] | null>(null);

  const load = useCallback(async () => {
    const [payeeRes, treasuryRes] = await Promise.all([
      fetch("/api/payees"),
      fetch("/api/treasury"),
    ]);
    const data = await payeeRes.json();
    setPayees((data.payees ?? []).filter((p: Payee) => isQueued(p.status)));
    setTreasury(await treasuryRes.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const included = useMemo(() => payees.filter((p) => !held.has(p.id)), [payees, held]);
  const total = useMemo(
    () => included.reduce((sum, p) => sum + p.amountUsdc, 0),
    [included]
  );
  const unclaimed = useMemo(
    () => included.filter((p) => !p.privyUserId),
    [included]
  );
  const balanceAfter = treasury ? treasury.amountUsdc - total : null;
  const overdrawn = balanceAfter !== null && balanceAfter < 0;

  function toggleHold(id: string) {
    setHeld((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmAndSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payeeIds: included.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send payouts.");
      setReceipt(data.payouts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send payouts.");
    } finally {
      setSending(false);
    }
  }

  if (receipt) return <Receipt payouts={receipt} />;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-[15px] text-ink-mute">
        Loading run…
      </div>
    );
  }

  if (payees.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <BackLink />
        <div className="mt-6 rounded-card border border-dashed border-line bg-card p-12 text-center">
          <p className="text-[15px] text-ink-mute">
            Nothing is queued for this run.
          </p>
          <Link href="/dashboard" className={buttonClasses("secondary", "md", "mt-5")}>
            Back to payouts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <BackLink />

      <h1 className="mt-5 font-display text-[40px] leading-none tracking-[-0.01em] text-ink">
        Review this run
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-[1.6] text-ink-soft">
        Nothing has moved yet. Check the list below, then confirm.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Figure label="Recipients" value={String(included.length)} />
        <Figure label="Total" value={`${formatUsdc(total)} USDC`} />
        <Figure
          label="Balance after"
          value={balanceAfter === null ? "—" : `${formatUsdc(balanceAfter)} USDC`}
          tone={overdrawn ? "amber" : "default"}
          note={overdrawn ? "Exceeds treasury balance" : undefined}
        />
      </div>

      {unclaimed.length > 0 && (
        <div className="mt-6 rounded-card border border-amber-100 bg-amber-50 p-5">
          <div className="text-[13px] font-semibold text-amber-text">
            {unclaimed.length} recipient{unclaimed.length === 1 ? " hasn't" : "s haven't"}{" "}
            claimed their wallet yet
          </div>
          <p className="mt-2 text-[14px] leading-[1.6] text-amber-text">
            Their funds will wait there safely until they sign in — you can send
            now, or hold them back.
          </p>
          <button
            onClick={() =>
              setHeld((prev) => {
                const next = new Set(prev);
                unclaimed.forEach((p) => next.add(p.id));
                return next;
              })
            }
            className={buttonClasses("secondary", "sm", "mt-4")}
          >
            Hold back unclaimed
          </button>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-card border border-line bg-card">
        <div className="border-b border-line px-5 py-3">
          <Eyebrow>Line items</Eyebrow>
        </div>
        <ul>
          {payees.map((payee) => {
            const isHeld = held.has(payee.id);
            return (
              <li
                key={payee.id}
                className={cn(
                  "flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4 last:border-0",
                  isHeld && "opacity-50"
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{payee.name}</div>
                  <div className="text-[13px] text-ink-mute">{payee.email}</div>
                  <div className="mt-1 font-mono text-[12px] text-ink-mute">
                    {truncateAddress(payee.walletAddress)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {!payee.privyUserId && <Chip tone="amber">Unclaimed</Chip>}
                  <div className="text-right font-medium text-ink">
                    {formatUsdc(payee.amountUsdc)}{" "}
                    <span className="text-ink-mute">USDC</span>
                  </div>
                  <button
                    onClick={() => toggleHold(payee.id)}
                    className="text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink"
                  >
                    {isHeld ? "Include" : "Hold"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {error && (
        <div className="mt-6 rounded-card border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-text">
          {error}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          onClick={confirmAndSend}
          disabled={sending || included.length === 0 || overdrawn}
          className={buttonClasses("primary", "lg")}
        >
          {sending ? "Sending…" : `Confirm and send ${formatUsdc(total)} USDC`}
        </button>
        <Link href="/dashboard" className={buttonClasses("secondary", "lg")}>
          Cancel
        </Link>
      </div>
      {included.length === 0 && (
        <p className="mt-3 text-[13px] text-ink-mute">
          Every recipient is held back — nothing to send.
        </p>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink"
    >
      ← Back to payouts
    </Link>
  );
}

function Figure({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-5",
        tone === "amber" ? "border-amber-100 bg-amber-50" : "border-line bg-card"
      )}
    >
      <Eyebrow className={tone === "amber" ? "text-amber-text" : undefined}>{label}</Eyebrow>
      <div
        className={cn(
          "mt-3 text-[24px] leading-none font-semibold",
          tone === "amber" ? "text-amber-text" : "text-ink"
        )}
      >
        {value}
      </div>
      {note && <div className="mt-2 text-[13px] text-amber-text">{note}</div>}
    </div>
  );
}

/* --------------------------------------------------------- receipt --- */

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

function Receipt({ payouts }: { payouts: Payout[] }) {
  const settled = payouts.filter((p) => p.status === "sent");

  function downloadReceipt() {
    const header = "name,email,wallet,amount_usdc,status,transaction_hash,sent_at";
    const rows = payouts.map((p) =>
      [
        p.payeeName,
        p.payeeEmail,
        p.walletAddress,
        p.amountUsdc.toFixed(2),
        p.status,
        p.transferId ?? "",
        p.sentAt ?? "",
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

  const total = payouts.reduce((sum, p) => sum + p.amountUsdc, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-ink">
        {settled.length} payment{settled.length === 1 ? "" : "s"} sent
      </h1>
      <p className="mt-3 text-[15px] text-ink-soft">
        {formatUsdc(total)} USDC across {payouts.length} recipient
        {payouts.length === 1 ? "" : "s"}. Every line has a receipt.
      </p>

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
    </div>
  );
}
