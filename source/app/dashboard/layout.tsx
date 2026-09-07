"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppChrome } from "@/components/AppChrome";
import { resolveSession, type SessionInfo } from "@/lib/client-api";
import { isPrivyClientConfigured } from "../providers";

/**
 * Chrome + auth gate for every dashboard route.
 *
 * Unauthenticated visitors are sent to "/" rather than shown a sign-in prompt
 * here — the landing page owns login, and routing after login is decided by
 * identity. A signed-in identity that is a payee, or an employer who has not
 * yet named their company, is redirected to where it actually belongs rather
 * than being shown an empty dashboard.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col">
        <AppChrome />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGate>
  );
}

function Waiting() {
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-ink-mute">
      Loading…
    </main>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  // Without Privy there is no way to authenticate anyone, so the dashboard
  // cannot be entered at all. Mock mode covers the capability endpoint, not
  // the employer product.
  if (!isPrivyClientConfigured) return <NotConfigured />;
  return <AuthGateInner>{children}</AuthGateInner>;
}

function NotConfigured() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-[32px] text-ink">Sign-in isn&rsquo;t configured</h1>
      <p className="max-w-md text-[15px] text-ink-soft">
        Set <code className="font-mono text-[13px]">NEXT_PUBLIC_PRIVY_APP_ID</code> to
        enable the dashboard. The agent capability endpoint still runs in mock mode.
      </p>
    </main>
  );
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [resolved, setResolved] = useState(false);

  // Unauthenticated visitors never see the dashboard shell.
  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    (async () => {
      const s = await resolveSession();
      if (cancelled) return;
      setSession(s);
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  // Send people who do not belong on the dashboard where they do belong. The
  // welcome screen is itself under /dashboard, so it must not redirect to
  // itself.
  useEffect(() => {
    if (!resolved || !session) return;
    if (session.status === "payee") {
      router.replace("/claim");
    } else if (session.status === "needs-company" && pathname !== "/dashboard/welcome") {
      router.replace("/dashboard/welcome");
    } else if (session.status === "employer" && pathname === "/dashboard/welcome") {
      router.replace("/dashboard");
    }
  }, [resolved, session, pathname, router]);

  if (!ready || !authenticated || !resolved) return <Waiting />;
  if (session?.status === "payee") return <Waiting />;
  if (session?.status === "needs-company" && pathname !== "/dashboard/welcome") {
    return <Waiting />;
  }

  return <>{children}</>;
}
