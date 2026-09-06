"use client";

import { useState, type FormEvent } from "react";

export interface PayeeFormValues {
  name: string;
  email: string;
  amountUsdc: number;
}

export function PayeeForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (values: PayeeFormValues) => Promise<void> | void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const amountUsdc = Number(amount);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setError("Enter a valid USDC amount greater than 0.");
      return;
    }

    try {
      await onSubmit({ name: name.trim(), email: email.trim(), amountUsdc });
      setName("");
      setEmail("");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payee.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:gap-3"
    >
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="payee-name" className="text-xs font-medium text-ink-600">
          Name
        </label>
        <input
          id="payee-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Amara Okafor"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="payee-email" className="text-xs font-medium text-ink-600">
          Email
        </label>
        <input
          id="payee-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="amara@example.com"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="flex w-full flex-col gap-1 sm:w-36">
        <label htmlFor="payee-amount" className="text-xs font-medium text-ink-600">
          Amount (USDC)
        </label>
        <input
          id="payee-amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Adding…" : "Add payee"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
