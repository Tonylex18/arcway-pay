import type { Company, User } from "@prisma/client";
import { PrivyClient } from "@privy-io/server-auth";
import { prisma } from "./prisma";
import { isPrivyConfigured } from "./privy";

/**
 * Server-side request authentication.
 *
 * Every non-public API route runs a request through here before touching
 * data. The client sends the Privy access token as `Authorization: Bearer
 * <token>`; this module verifies that token's signature against Privy's
 * verification key, resolves it to our own `User` row, and hands the caller
 * the company that user is allowed to act for.
 *
 * The company on the returned context is the ONLY company a request may read
 * or write. Routes must pass it into every store call rather than trusting
 * anything in the request body — a caller can put any companyId in a payload,
 * but cannot forge a signed token.
 */

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

let cachedClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!cachedClient) {
    cachedClient = new PrivyClient(
      process.env.PRIVY_APP_ID as string,
      process.env.PRIVY_APP_SECRET as string
    );
  }
  return cachedClient;
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!/^Bearer$/i.test(scheme ?? "") || !token) {
    throw new AuthError("Missing bearer token.");
  }
  return token;
}

export interface VerifiedIdentity {
  privyUserId: string;
  email: string | null;
}

/**
 * Verifies the request's access token and resolves the caller's Privy
 * identity. Does not touch our database.
 */
export async function verifyIdentity(request: Request): Promise<VerifiedIdentity> {
  if (!isPrivyConfigured) {
    // No credentials means no way to verify a signature, so there is no such
    // thing as an authenticated request. Deny rather than degrade open —
    // mock mode is for the capability endpoint, not for the dashboard.
    throw new AuthError("Authentication is not configured on this server.");
  }

  const token = bearerToken(request);
  const privy = getPrivyClient();

  let privyUserId: string;
  try {
    const claims = await privy.verifyAuthToken(token);
    privyUserId = claims.userId;
  } catch {
    throw new AuthError("Invalid or expired access token.");
  }

  // The token proves who they are but carries no email, and the routing rules
  // in Phase 1 match payees by email — so fetch the linked address.
  let email: string | null = null;
  try {
    const privyUser = await privy.getUserById(privyUserId);
    email = privyUser.email?.address?.toLowerCase() ?? null;
  } catch {
    // A verified token with an unreadable profile is still a valid identity;
    // callers that need the email handle null themselves.
  }

  return { privyUserId, email };
}

export interface AuthContext {
  user: User;
  /** Null for payees, who belong to no company of their own. */
  company: Company | null;
  email: string | null;
}

/**
 * Verifies the request and resolves it to an existing account.
 *
 * Throws 401 when the token is missing, invalid, or belongs to somebody who
 * has not finished signing up — a Privy identity with no `User` row is
 * authenticated but has no account here yet, and must go through
 * `/api/session` before it can reach data.
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const { privyUserId, email } = await verifyIdentity(request);

  const user = await prisma.user.findUnique({
    where: { privyUserId },
    include: { company: true },
  });

  if (!user) {
    throw new AuthError("No account for this identity yet.");
  }

  return { user, company: user.company ?? null, email };
}

export interface EmployerContext {
  user: User;
  company: Company;
}

/**
 * The guard for every employer data route. Guarantees a company, so callers
 * can scope their queries without a null check.
 */
export async function requireEmployer(request: Request): Promise<EmployerContext> {
  const { user, company } = await requireAuth(request);

  if (user.role !== "EMPLOYER" || !company) {
    throw new AuthError("This account cannot access company payouts.", 403);
  }

  return { user, company };
}

/** Turns an AuthError into its JSON response; rethrows anything else. */
export function authErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
