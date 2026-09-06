/**
 * Shared domain types for the payout app.
 *
 * These are the shapes the UI and API routes speak. They map 1:1 onto the
 * Prisma models in prisma/schema.prisma, with two deliberate conversions
 * applied at the store boundary (lib/store.ts): `Decimal` becomes `number`,
 * and `DateTime` becomes an ISO-8601 `string`, so nothing above the store
 * has to know Prisma's runtime types.
 */

export type PayeeStatus = "pending" | "sending" | "sent" | "failed";

export interface Payee {
  /** Internal id (uuid). */
  id: string;
  name: string;
  email: string;
  /** Amount to pay out, denominated in whole USDC (e.g. 250.5 = 250.50 USDC). */
  amountUsdc: number;
  /**
   * The payee's embedded wallet address, provisioned via Privy the moment
   * the payee is added (see lib/privy.ts). In mock mode this is a
   * deterministically-generated fake address so the UI still looks real.
   */
  walletAddress: string;
  /**
   * Set once the payee has signed in and claimed their embedded wallet.
   * Absent means unclaimed — the amber "Not yet" state in the dashboard.
   */
  privyUserId?: string;
  status: PayeeStatus;
  /** Circle transfer id once a payout has been attempted, if any. */
  transferId?: string;
  /** Human-readable failure reason, set only when status === "failed". */
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewPayeeInput {
  name: string;
  email: string;
  amountUsdc: number;
}

/**
 * Result of a single payout attempt, returned by lib/circle.ts.
 */
export interface TransferResult {
  transferId: string;
  status: "pending" | "complete" | "failed";
  errorMessage?: string;
}

/**
 * One recipient's line in one payout run — an immutable ledger row, so a
 * payee paid every month has one `Payout` per month. Written when a run is
 * confirmed, then updated in place only to record its terminal status.
 */
export interface Payout {
  id: string;
  payeeId: string;
  /** Denormalised for display, so a receipt renders without a second query. */
  payeeName: string;
  payeeEmail: string;
  walletAddress: string;
  /** True when the payee had claimed their wallet at the time of the run. */
  claimed: boolean;
  amountUsdc: number;
  status: PayeeStatus;
  transferId?: string;
  failureReason?: string;
  createdAt: string;
  sentAt?: string;
}
