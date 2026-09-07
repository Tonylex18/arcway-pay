import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, verifyIdentity } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves who the signed-in identity is, and where they belong.
 *
 * Identity decides the role, never the button that was clicked. The order is
 * deliberate:
 *
 *   a) a User already exists for this Privy id -> route by their stored role
 *   b) no User, but the verified email matches a Payee row -> they are a
 *      payee claiming their wallet; create User(PAYEE) and send them to /claim
 *   c) neither -> a new employer, who must name their company first
 *
 * (b) is what stops a contractor who clicks "Start paying" from being handed
 * an employer dashboard, and equally stops an employer's own payee row from
 * hijacking their session — (a) wins for anyone who already has an account.
 */
export async function GET(request: Request) {
  try {
    const { privyUserId, email } = await verifyIdentity(request);

    // (a) Existing account — stored role is authoritative.
    const existing = await prisma.user.findUnique({
      where: { privyUserId },
      include: { company: true },
    });

    if (existing) {
      return NextResponse.json({
        status: existing.role === "EMPLOYER" ? "employer" : "payee",
        role: existing.role,
        email: existing.email,
        company: existing.company
          ? { id: existing.company.id, name: existing.company.name }
          : null,
        destination: existing.role === "EMPLOYER" ? "/dashboard" : "/claim",
      });
    }

    if (!email) {
      throw new AuthError("This account has no email address linked.", 403);
    }

    // (b) Known payee signing in for the first time.
    const payee = await prisma.payee.findFirst({ where: { email } });
    if (payee) {
      const user = await prisma.user.create({
        data: { privyUserId, email, role: "PAYEE" },
      });

      // Mark every payee row for this email as claimed, across all companies
      // that pay them — claiming is per person, not per employer.
      await prisma.payee.updateMany({
        where: { email, privyUserId: null },
        data: { privyUserId },
      });

      return NextResponse.json({
        status: "payee",
        role: user.role,
        email: user.email,
        company: null,
        destination: "/claim",
      });
    }

    // (c) Brand new employer — no company yet.
    return NextResponse.json({
      status: "needs-company",
      role: null,
      email,
      company: null,
      destination: "/dashboard/welcome",
    });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("Session resolution failed:", err);
    return NextResponse.json({ error: "Could not resolve session." }, { status: 500 });
  }
}
