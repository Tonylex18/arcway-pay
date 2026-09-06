/**
 * Shared domain types for the payout app.
 *
 * MVP NOTE: the current persistence layer (lib/store.ts) is a JSON file on
 * disk. These types are written so that swapping the store for Postgres +
 * Prisma later is a drop-in change — a `Payee` row here maps 1:1 to what a
 * `Payee` Prisma model would look like.
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
