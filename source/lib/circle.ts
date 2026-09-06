import { randomUUID } from "node:crypto";
import type { TransferResult } from "./types";

/**
 * USDC payout execution, via Circle's Developer-Controlled Wallets API on
 * Arc (Circle's L1 built for stablecoin finance — https://www.circle.com/arc).
 *
 * This is the "Arc track" half of the submission: this module is the single
 * place that talks to Circle. A dashboard "Send Payouts" click calls
 * `createTransfer()` once per pending payee; the dashboard then polls or
 * re-checks status via `getTransferStatus()`.
 *
 * Docs: https://developers.circle.com/w3s/ (Developer-Controlled Wallets)
 *
 * ---------------------------------------------------------------------------
 * MOCK MODE (default, no credentials required)
 * ---------------------------------------------------------------------------
 * If CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET are not set, every function below
 * simulates the real Circle flow instead of calling the network:
 *   - createTransfer() returns immediately with status "pending" and a
 *     generated transferId, exactly like Circle's real API would.
 *   - getTransferStatus() simulates the transfer "landing" a few seconds
 *     after creation, resolving to "complete" (occasionally "failed", to
 *     exercise the UI's failure state) so the dashboard's Sending -> Sent
 *     flow looks and feels real end-to-end.
 * This lets the whole app run and be demoed with zero external accounts.
 *
 * ---------------------------------------------------------------------------
 * GOING LIVE: what to change
 * ---------------------------------------------------------------------------
 * 1. Create a Circle sandbox account (https://console.circle.com), generate
 *    a sandbox API key, and set up Developer-Controlled Wallets (an entity
 *    secret is generated client-side with Circle's tooling and registered
 *    with your account — see their quickstart).
 * 2. Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env.local.
 * 3. Create (or reuse) one developer-controlled "treasury" wallet that will
 *    be the *source* of payouts, funded with sandbox USDC from Circle's
 *    faucet, and set its id as CIRCLE_TREASURY_WALLET_ID.
 * 4. Fill in the two fetch() calls below (createTransfer / getTransferStatus)
 *    against Circle's REST API. The general shape (subject to Circle's
 *    current API reference, since field names do shift between versions):
 *      POST https://api.circle.com/v1/w3s/developer/transactions/transfer
 *        Authorization: Bearer <CIRCLE_API_KEY>
 *        body: {
 *          idempotencyKey: <uuid>,
 *          entitySecretCipherText: <RSA-encrypted entity secret, generated
 *            per-request with Circle's public key — their Node SDK
 *            (@circle-fin/developer-controlled-wallets) does this for you
 *            and is the recommended way to avoid hand-rolling the crypto>,
 *          walletId: CIRCLE_TREASURY_WALLET_ID,
 *          tokenId: <USDC token id for the target chain/Arc testnet>,
 *          destinationAddress: <payee's Privy embedded wallet address>,
 *          amounts: [<amountUsdc as a string>],
 *          feeLevel: "MEDIUM",
 *        }
 *      GET https://api.circle.com/v1/w3s/transactions/{id}
 *        -> { transaction: { state: "COMPLETE" | "PENDING" | "FAILED" | ... } }
 *    In practice, swap the raw fetch() calls below for Circle's official
 *    SDK (`@circle-fin/developer-controlled-wallets`), which handles entity
 *    secret encryption and request signing for you — that's the realistic
 *    "day 3-5" task noted in the README punch list.
 * 5. Swap the USDC token id / chain config to target Arc's testnet instead
 *    of a generic EVM testnet once Arc testnet is available in your Circle
 *    console (see https://www.circle.com/arc for the latest network details).
 */

/**
 * Live mode requires a treasury wallet to send *from*, not just credentials.
 * An API key with no CIRCLE_TREASURY_WALLET_ID cannot produce a transfer, so
 * treating that as "configured" would fail every payout against the real API
 * instead of falling back to the mock path. All three must be present.
 */
export const isCircleConfigured = Boolean(
  process.env.CIRCLE_API_KEY &&
    process.env.CIRCLE_ENTITY_SECRET &&
    process.env.CIRCLE_TREASURY_WALLET_ID
);

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

export interface CreateTransferInput {
  /** Destination USDC wallet address (the payee's Privy embedded wallet). */
  destinationAddress: string;
  /** Amount in whole USDC, e.g. 250.5. */
  amountUsdc: number;
  /** Used as the request's idempotency key so retries are safe. */
  idempotencyKey?: string;
}

/**
 * Kicks off a USDC transfer from the treasury wallet to a payee.
 * Returns immediately with a transfer id and an initial status — payouts on
 * real chains are asynchronous, so the caller polls getTransferStatus().
 */
export async function createTransfer(
  input: CreateTransferInput
): Promise<TransferResult> {
  if (!isCircleConfigured) {
    // --- MOCK MODE ---
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      transferId: `mock_${randomUUID()}`,
      status: "pending",
    };
  }

  // --- REAL CIRCLE ARC API CALL ---
  // See the module header for the exact request shape and why the official
  // Circle SDK is the better long-term fit for entity-secret encryption.
  const response = await fetch(`${CIRCLE_API_BASE}/developer/transactions/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      walletId: process.env.CIRCLE_TREASURY_WALLET_ID,
      destinationAddress: input.destinationAddress,
      amounts: [input.amountUsdc.toString()],
      feeLevel: "MEDIUM",
      // TODO: set tokenId to USDC on your target chain / Arc testnet, and
      // provide the entitySecretCipherText Circle requires per-request.
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      transferId: "",
      status: "failed",
      errorMessage: `Circle API error (${response.status}): ${body}`,
    };
  }

  const data = await response.json();
  return {
    transferId: data.data?.id ?? data.id ?? "",
    status: "pending",
  };
}

/**
 * Checks the current state of a previously-created transfer.
 */
export async function getTransferStatus(
  transferId: string
): Promise<TransferResult> {
  if (!isCircleConfigured || transferId.startsWith("mock_")) {
    // --- MOCK MODE ---
    // Deterministically resolve based on how long ago the mock transfer was
    // created (encoded implicitly by the caller re-polling); here we just
    // simulate near-immediate settlement with a small, stable failure rate
    // so the UI's "Failed" state is reachable during a demo.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const failed = hashToUnitInterval(transferId) < 0.08; // ~8% simulated failure rate
    return {
      transferId,
      status: failed ? "failed" : "complete",
      errorMessage: failed ? "Simulated failure (mock mode)" : undefined,
    };
  }

  // --- REAL CIRCLE ARC API CALL ---
  const response = await fetch(`${CIRCLE_API_BASE}/transactions/${transferId}`, {
    headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
  });

  if (!response.ok) {
    return {
      transferId,
      status: "failed",
      errorMessage: `Circle API error (${response.status})`,
    };
  }

  const data = await response.json();
  const state: string = data.data?.transaction?.state ?? data.transaction?.state ?? "";
  const status =
    state === "COMPLETE" || state === "CONFIRMED"
      ? "complete"
      : state === "FAILED" || state === "CANCELLED"
        ? "failed"
        : "pending";

  return { transferId, status };
}

/** Small, dependency-free string -> [0,1) hash used only for mock-mode variety. */
function hashToUnitInterval(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

/**
 * The treasury wallet's spendable USDC balance — the figure the dashboard
 * shows as "Treasury balance" and subtracts a run's total from to preview
 * the balance after.
 *
 * MOCK MODE: returns a fixed, obviously-round sandbox figure. It is labelled
 * `mocked: true` so the UI can say so rather than implying a funded treasury.
 *
 * GOING LIVE: read the wallet's token balances from
 * GET /v1/w3s/wallets/{id}/balances and pick out the USDC entry.
 */
export interface TreasuryBalance {
  amountUsdc: number;
  mocked: boolean;
}

const MOCK_TREASURY_USDC = 25_000;

export async function getTreasuryBalance(): Promise<TreasuryBalance> {
  if (!isCircleConfigured) {
    return { amountUsdc: MOCK_TREASURY_USDC, mocked: true };
  }

  // Live path is wired in Phase 3 alongside the real transfer calls; until
  // then fall back to the mock figure rather than inventing a number that
  // looks authoritative.
  return { amountUsdc: MOCK_TREASURY_USDC, mocked: true };
}
