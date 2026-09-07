"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Brand";
import { buttonClasses } from "@/components/ui";
import { resolveSession, type SessionInfo } from "@/lib/client-api";
import { isPrivyClientConfigured } from "../providers";

/**
 * PLACEHOLDER — Phase 2 builds the real claim experience (live on-chain
 * balance, withdraw to an external address). What matters now is that login
 * routing lands the right people here: this page is reached only by an
 * identity whose email matches a Payee row.
 */
export default function ClaimPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Nothing to resolve without Privy, so start already settled rather than
  // flipping the flag from inside an effect.
  const [checked, setChecked] = useState(!isPrivyClientConfigured);

  useEffect(() => {
    if (!isPrivyClientConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await resolveSession();
        if (!cancelled) setSession(s);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-ink">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="font-display text-[40px] leading-tight tracking-[-0.01em] text-ink">
          Your money is waiting
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-ink-soft">
          {checked && session?.email
            ? `You're signed in as ${session.email}. `
            : ""}
          A wallet was created for you when you were first paid, and signing in
          is what puts you in control of it.
        </p>

        <div className="mt-8 rounded-card border border-amber-100 bg-amber-50 p-6">
          <div className="text-[13px] font-semibold text-amber-text">
            This screen is still being built
          </div>
          <p className="mt-2 text-[14px] leading-[1.6] text-amber-text">
            Your balance and the option to move funds out arrive in the next
            release. Nothing is lost in the meantime — the funds sit in your
            wallet whether or not this page can show them yet.
          </p>
        </div>

        <Link href="/" className={buttonClasses("secondary", "md", "mt-8")}>
          Back to Arcway
        </Link>
      </main>
    </div>
  );
}
