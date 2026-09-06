import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NewPayeeInput, Payee, PayeeStatus } from "./types";

/**
 * MVP persistence layer: a JSON file on disk.
 *
 * This is intentionally the simplest thing that works for a hackathon demo
 * running on a single local `next dev` process — no database setup required.
 *
 * PRODUCTION UPGRADE PATH: swap this module for Prisma + Postgres. The
 * `Payee` type in lib/types.ts is already shaped like a Prisma model, so the
 * rest of the app (API routes, components) would not need to change — only
 * the functions in this file would be reimplemented with `prisma.payee.*`
 * calls. See the README's "Production upgrade path" section.
 *
 * CAVEAT: on serverless platforms (e.g. Vercel), the filesystem is
 * read-only except for /tmp, and /tmp is not shared across function
 * invocations or persisted between deploys. This store works great for
 * `npm run dev` / `npm start` on a normal server, but on Vercel it should be
 * treated as ephemeral, per-instance storage — fine for a demo, not for a
 * real deployment. That's exactly the gap Postgres/Prisma closes.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "payees.json");

// Simple in-process write queue so concurrent API calls don't clobber each
// other's writes to the JSON file (no real transactions here — good enough
// for a single-instance dev server, not a substitute for a real database).
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  // Swallow errors for the queue's own chaining purposes; callers still see
  // the real rejection via `result`.
  writeQueue = result.catch(() => undefined);
  return result;
}

async function ensureDataFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf-8");
  } catch {
    await writeFile(DATA_FILE, "[]\n", "utf-8");
  }
}

async function readAll(): Promise<Payee[]> {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Payee[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(payees: Payee[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(payees, null, 2) + "\n", "utf-8");
}

export async function listPayees(): Promise<Payee[]> {
  const payees = await readAll();
  // Newest first, so a freshly-added payee shows up at the top of the table.
  return [...payees].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPayee(
  input: NewPayeeInput,
  walletAddress: string
): Promise<Payee> {
  return enqueue(async () => {
    const payees = await readAll();
    const now = new Date().toISOString();
    const payee: Payee = {
      id: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      amountUsdc: input.amountUsdc,
      walletAddress,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    payees.push(payee);
    await writeAll(payees);
    return payee;
  });
}

export async function updatePayeeStatus(
  id: string,
  status: PayeeStatus,
  extra: Partial<Pick<Payee, "transferId" | "failureReason">> = {}
): Promise<Payee | null> {
  return enqueue(async () => {
    const payees = await readAll();
    const idx = payees.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    payees[idx] = {
      ...payees[idx],
      status,
      ...extra,
      updatedAt: new Date().toISOString(),
    };
    await writeAll(payees);
    return payees[idx];
  });
}

export async function getPayee(id: string): Promise<Payee | null> {
  const payees = await readAll();
  return payees.find((p) => p.id === id) ?? null;
}
