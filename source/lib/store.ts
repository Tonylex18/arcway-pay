import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { NewPayeeInput, Payee, PayeeStatus, Payout } from "./types";

/**
 * Persistence layer — Postgres (Neon) via Prisma.
 *
 * This replaces the MVP JSON-file store. The exported function signatures are
 * unchanged from that version, so API routes and components did not need to
 * change when it was swapped.
 *
 * TWO CONVERSIONS happen here and nowhere else:
 *   - `Decimal` -> `number`. Money is stored as Decimal(20, 6) because USDC
 *     has 6 decimals and floats are the wrong tool for currency; the app's
 *     `Payee.amountUsdc` contract stays `number`.
 *   - `DateTime` -> ISO-8601 `string`, which is what the client components
 *     already expect.
 *
 * COMPANY SCOPING IS NOT WIRED YET. Every read and write goes through a single
 * default Company row (see `getDefaultCompanyId`). Phase 1 replaces that call
 * with the authenticated user's company; because every query below already
 * filters on `companyId`, that is a one-line change per function rather than a
 * rewrite.
 */

const DEFAULT_COMPANY_ID = "default-company";
const DEFAULT_COMPANY_NAME = "Arcway Sandbox";

/**
 * Resolves the company that unauthenticated requests operate as, creating it
 * on first use. Phase 1 replaces callers of this with the company resolved
 * from the request's Privy token.
 */
export async function getDefaultCompanyId(): Promise<string> {
  await prisma.company.upsert({
    where: { id: DEFAULT_COMPANY_ID },
    update: {},
    create: { id: DEFAULT_COMPANY_ID, name: DEFAULT_COMPANY_NAME },
  });
  return DEFAULT_COMPANY_ID;
}

type PayeeRow = Prisma.PayeeGetPayload<Record<string, never>>;
type PayoutRow = Prisma.PayoutGetPayload<{ include: { payee: true } }>;

function toPayee(row: PayeeRow): Payee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    amountUsdc: row.amountUsdc.toNumber(),
    walletAddress: row.walletAddress,
    privyUserId: row.privyUserId ?? undefined,
    status: row.status,
    transferId: row.transferId ?? undefined,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPayout(row: PayoutRow): Payout {
  return {
    id: row.id,
    payeeId: row.payeeId,
    payeeName: row.payee.name,
    payeeEmail: row.payee.email,
    walletAddress: row.payee.walletAddress,
    claimed: row.payee.privyUserId != null,
    amountUsdc: row.amountUsdc.toNumber(),
    status: row.status,
    transferId: row.transferId ?? undefined,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString(),
  };
}

export async function listPayees(): Promise<Payee[]> {
  const companyId = await getDefaultCompanyId();
  const rows = await prisma.payee.findMany({
    where: { companyId },
    // Newest first, so a freshly-added payee shows up at the top of the table.
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPayee);
}

/**
 * Adds a payee, or updates the standing amount and name if that email is
 * already on this company's list.
 *
 * The upsert exists because (companyId, email) is unique: the same person
 * cannot appear twice on one company's payroll. Re-adding them is read as
 * "change what they're owed", which is what the dashboard's add form should
 * do. Their wallet address is never reassigned once provisioned.
 */
export async function createPayee(
  input: NewPayeeInput,
  walletAddress: string
): Promise<Payee> {
  const companyId = await getDefaultCompanyId();
  const email = input.email.trim().toLowerCase();

  const row = await prisma.payee.upsert({
    where: { companyId_email: { companyId, email } },
    update: {
      name: input.name.trim(),
      amountUsdc: new Prisma.Decimal(input.amountUsdc),
      status: "pending",
    },
    create: {
      companyId,
      name: input.name.trim(),
      email,
      amountUsdc: new Prisma.Decimal(input.amountUsdc),
      walletAddress,
      status: "pending",
    },
  });
  return toPayee(row);
}

export async function updatePayeeStatus(
  id: string,
  status: PayeeStatus,
  extra: Partial<Pick<Payee, "transferId" | "failureReason">> = {}
): Promise<Payee | null> {
  try {
    const row = await prisma.payee.update({
      where: { id },
      data: {
        status,
        ...(extra.transferId !== undefined ? { transferId: extra.transferId } : {}),
        // An explicit undefined must still clear a stale reason on retry.
        failureReason: extra.failureReason ?? null,
      },
    });
    return toPayee(row);
  } catch (err) {
    // P2025 = record not found, which the JSON store signalled with null.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return null;
    }
    throw err;
  }
}

export async function getPayee(id: string): Promise<Payee | null> {
  const row = await prisma.payee.findUnique({ where: { id } });
  return row ? toPayee(row) : null;
}

/* ------------------------------------------------------------ payouts --- */

/**
 * Opens a ledger row for one recipient in one run. Called once per recipient
 * at the moment a run is confirmed, before any transfer is attempted, so a
 * crash mid-run still leaves a record of what was intended.
 */
export async function createPayout(
  payeeId: string,
  amountUsdc: number
): Promise<Payout> {
  const companyId = await getDefaultCompanyId();
  const row = await prisma.payout.create({
    data: {
      companyId,
      payeeId,
      amountUsdc: new Prisma.Decimal(amountUsdc),
      status: "pending",
    },
    include: { payee: true },
  });
  return toPayout(row);
}

export async function updatePayoutStatus(
  id: string,
  status: PayeeStatus,
  extra: { transferId?: string; failureReason?: string } = {}
): Promise<Payout | null> {
  try {
    const row = await prisma.payout.update({
      where: { id },
      data: {
        status,
        ...(extra.transferId !== undefined ? { transferId: extra.transferId } : {}),
        failureReason: extra.failureReason ?? null,
        // Stamped when the transfer reaches a terminal state, so a receipt can
        // show when the money actually landed.
        ...(status === "sent" || status === "failed" ? { sentAt: new Date() } : {}),
      },
      include: { payee: true },
    });
    return toPayout(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return null;
    }
    throw err;
  }
}

/** Every payout ever recorded for this company, newest first. */
export async function listPayouts(limit = 100): Promise<Payout[]> {
  const companyId = await getDefaultCompanyId();
  const rows = await prisma.payout.findMany({
    where: { companyId },
    include: { payee: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toPayout);
}

/** The payouts written by one run, identified by the ids returned when it ran. */
export async function listPayoutsByIds(ids: string[]): Promise<Payout[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.payout.findMany({
    where: { id: { in: ids } },
    include: { payee: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPayout);
}
