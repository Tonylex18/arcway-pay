"use client";

import { useMemo, useState } from "react";
import { WithdrawalReceipt } from "@/components/WithdrawalReceipt";
import { buttonClasses, Chip, Eyebrow } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { WithdrawalRecord } from "@/lib/types";
import { cn, formatUsdc } from "@/lib/utils";

const NETWORK_FEE_USDC = 0.01;

/** The API returns the full record, so the receipt renders from real data. */
type Success = WithdrawalRecord;

const inputClasses =
  "mt-2 w-full rounded-btn border border-line bg-card px-3 py-2.5 text-[15px] text-ink " +
  "outline-none placeholder:text-ink-mute focus:border-emerald";

export function WithdrawPanel({
  balanceUsdc,
  onComplete,
}: {
  balanceUsdc: number;
  onComplete: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  // The most that can leave the wallet is the balance minus the fee, so a
  // Max click cannot produce an amount the server will reject.
  const maxSendable = Math.max(0, balanceUsdc - NETWORK_FEE_USDC);
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const receives = useMemo(() => (valid ? parsed : 0), [valid, parsed]);
  const total = receives > 0 ? receives + NETWORK_FEE_USDC : 0;
  const overBalance = total > balanceUsdc + 1e-9;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/claim/withdraw", {
        method: "POST",
        body: JSON.stringify({ amountUsdc: parsed, destinationAddress: destination.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not complete the withdrawal.");
      setSuccess(data);
      setConfirming(false);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the withdrawal.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSuccess(null);
    setAmount("");
    setDestination("");
    setError(null);
    setOpen(false);
  }

  if (success) {
    // The same component the permalink renders, so the screen you saw at the
    // time and the one you reopen later cannot drift apart.
    return (
      <div className="mt-4">
        <WithdrawalReceipt withdrawal={success} />
        <button onClick={reset} className={buttonClasses("quiet", "md", "mt-3")}>
          Make another withdrawal
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => setOpen(true)}
          disabled={balanceUsdc <= 0}
          className={buttonClasses("primary", "lg")}
        >
          Withdraw
        </button>
        <CashOutToBank />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-card p-6">
      <Eyebrow>Withdraw USDC</Eyebrow>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor="wd-amount" className="text-[13px] font-medium text-ink-soft">
            Amount
          </label>
          <button
            onClick={() => setAmount(maxSendable.toFixed(2))}
            className="text-[13px] text-emerald underline underline-offset-2"
          >
            Max ({formatUsdc(maxSendable)})
          </button>
        </div>
        <input
          id="wd-amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={inputClasses}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="wd-dest" className="text-[13px] font-medium text-ink-soft">
          Destination address
        </label>
        <input
          id="wd-dest"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="0x…"
          className={cn(inputClasses, "font-mono text-[13px]")}
        />
      </div>

      <dl className="mt-5 border-t border-line-soft pt-4 text-[14px]">
        <div className="flex justify-between py-1">
          <dt className="text-ink-soft">You receive</dt>
          <dd className="font-medium text-ink">{formatUsdc(receives)} USDC</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-ink-soft">Network fee (estimated)</dt>
          <dd className="text-ink-soft">{formatUsdc(NETWORK_FEE_USDC)} USDC</dd>
        </div>
        <div className="flex justify-between border-t border-line-soft py-2 pt-3">
          <dt className="font-medium text-ink">Total from your balance</dt>
          <dd className={cn("font-semibold", overBalance ? "text-amber-text" : "text-ink")}>
            {formatUsdc(total)} USDC
          </dd>
        </div>
      </dl>

      {overBalance && (
        <p className="mt-2 text-[13px] text-amber-text">
          That&rsquo;s more than your balance once the fee is included.
        </p>
      )}

      <div className="mt-5 rounded-card border border-amber-100 bg-amber-50 p-4">
        <p className="text-[13px] leading-[1.6] text-amber-text">
          <strong>This cannot be undone.</strong> Once sent, the money is gone
          from this wallet — check the address character by character. There is
          no way for Arcway to reverse it or recover funds sent to the wrong
          place.
        </p>
      </div>

      {error && <p className="mt-3 text-[13px] text-amber-text">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        {confirming ? (
          <>
            <button
              onClick={submit}
              disabled={busy}
              className={buttonClasses("primary", "md")}
            >
              {busy ? "Sending…" : `Yes — send ${formatUsdc(receives)} USDC`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className={buttonClasses("secondary", "md")}
            >
              Go back
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirming(true)}
              disabled={!valid || overBalance || !destination.trim()}
              className={buttonClasses("primary", "md")}
            >
              Review withdrawal
            </button>
            <button onClick={reset} className={buttonClasses("secondary", "md")}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CashOutToBank() {
  return (
    <div className="flex flex-col gap-2">
      <button
        disabled
        title="Not available yet"
        className={buttonClasses("secondary", "lg")}
      >
        Cash out to bank
        <Chip tone="amber" className="ml-1">Coming soon</Chip>
      </button>
      <p className="max-w-sm text-[12px] leading-[1.5] text-ink-mute">
        Paying out to a bank account needs a licensed off-ramp partner and a
        one-time identity check. That check is required by anti-money-laundering
        law, not by us.
      </p>
    </div>
  );
}
