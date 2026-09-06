"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PayeeForm, type PayeeFormValues } from "@/components/PayeeForm";
import { PayeeTable } from "@/components/PayeeTable";
import type { Payee } from "@/lib/types";
import { formatUsdc } from "@/lib/utils";
import { isPrivyClientConfigured } from "../providers";

export default function DashboardPage() {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ kind: "info" | "error"; text: string } | null>(
    null
  );

  const fetchPayees = useCallback(async () => {
    const res = await fetch("/api/payees");
    const data = await res.json();
    setPayees(data.payees ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await fetchPayees();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchPayees]);

  const pendingCount = useMemo(
    () => payees.filter((p) => p.status === "pending" || p.status === "failed").length,
    [payees]
  );
  const totalPendingUsdc = useMemo(
    () =>
      payees
        .filter((p) => p.status === "pending" || p.status === "failed")
        .reduce((sum, p) => sum + p.amountUsdc, 0),
    [payees]
  );
  const totalSentUsdc = useMemo(
    () => payees.filter((p) => p.status === "sent").reduce((sum, p) => sum + p.amountUsdc, 0),
    [payees]
  );

  async function handleAddPayee(values: PayeeFormValues) {
    setAdding(true);
    setBanner(null);
    try {
      const res = await fetch("/api/payees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add payee.");
      }
      await fetchPayees();
      setBanner({
        kind: "info",
        text: data.walletMocked
          ? `Added ${values.name} with a mock embedded wallet (Privy isn't configured — see README).`
          : `Added ${values.name} with a live Privy embedded wallet.`,
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleSendPayouts() {
    setSending(true);
    setBanner(null);
    try {
      const res = await fetch("/api/payouts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send payouts.");
      }
      setPayees(data.payees ?? []);
      setBanner({
        kind: "info",
        text: `Processed ${data.processed} payout${data.processed === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to send payouts.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <DashboardHeader />

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Payees" value={payees.length.toString()} />
          <StatCard label="Pending payout" value={`${formatUsdc(totalPendingUsdc)} USDC`} />
          <StatCard label="Sent" value={`${formatUsdc(totalSentUsdc)} USDC`} />
        </div>

        {banner && (
          <div
            className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
              banner.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-brand-200 bg-brand-50 text-brand-700"
            }`}
          >
            {banner.text}
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Payees</h2>
            <button
              onClick={handleSendPayouts}
              disabled={sending || pendingCount === 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending
                ? "Sending payouts…"
                : `Send payouts${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
            </button>
          </div>

          <div className="mb-6">
            <PayeeForm onSubmit={handleAddPayee} submitting={adding} />
          </div>

          {loading ? (
            <div className="rounded-xl border border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
              Loading payees…
            </div>
          ) : (
            <PayeeTable payees={payees} />
          )}
        </section>
      </main>
    </AuthGate>
  );
}

function DashboardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Payouts dashboard</h1>
        <p className="mt-1 text-sm text-ink-600">
          Add payees by email and send USDC payouts via Circle Arc.
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  if (!isPrivyClientConfigured) return null;
  return <SignOutButtonInner />;
}

function SignOutButtonInner() {
  const { authenticated, logout } = usePrivy();
  if (!authenticated) return null;
  return (
    <button
      onClick={() => logout()}
      className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50"
    >
      Sign out
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="mt-1 font-tabular text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}

/**
 * Gates the dashboard behind Privy auth when Privy is configured, but still
 * lets the dashboard render (unauthenticated) when it isn't — so the
 * landing page's "View demo dashboard" link always works, credentials or
 * not.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  if (!isPrivyClientConfigured) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-ink-500">
        Loading…
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-ink-900">Sign in to continue</h1>
        <p className="max-w-sm text-sm text-ink-600">
          Sign in with your email to access the payouts dashboard.
        </p>
        <button
          onClick={() => login()}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Sign in with email
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
