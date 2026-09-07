import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, verifyIdentity } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Completes employer signup: creates the Company and the User(EMPLOYER) that
 * administers it, in one transaction so a half-created account cannot exist.
 *
 * Refuses if this identity already has a User row, so the endpoint cannot be
 * replayed to spawn extra companies for the same person.
 */
export async function POST(request: Request) {
  try {
    const { privyUserId, email } = await verifyIdentity(request);

    if (!email) {
      throw new AuthError("This account has no email address linked.", 403);
    }

    let body: { name?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "A company name is required." }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "That company name is too long." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { privyUserId } });
    if (existing) {
      return NextResponse.json(
        { error: "This account is already set up." },
        { status: 409 }
      );
    }

    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({ data: { name } });
      await tx.user.create({
        data: { privyUserId, email, role: "EMPLOYER", companyId: created.id },
      });
      return created;
    });

    return NextResponse.json(
      {
        status: "employer",
        role: "EMPLOYER",
        email,
        company: { id: company.id, name: company.name },
        destination: "/dashboard",
      },
      { status: 201 }
    );
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    console.error("Company creation failed:", err);
    return NextResponse.json({ error: "Could not create company." }, { status: 500 });
  }
}
