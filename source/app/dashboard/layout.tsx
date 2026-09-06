"use client";

import { usePrivy } from "@privy-io/react-auth";
import { AppChrome } from "@/components/AppChrome";
import { buttonClasses } from "@/components/ui";
import { isPrivyClientConfigured } from "../providers";

/**
 * Chrome + auth gate for every dashboard route.
 *
 * When Privy is configured the whole section requires a signed-in user. When
 * it isn't — the app's mock mode, which exists so the capability endpoint can
 * be reviewed without credentials — the dashboard renders open, since there
 * is no identity provider to authenticate against.
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

function AuthGate({ children }: { children: React.ReactNode }) {
  if (!isPrivyClientConfigured) return <>{children}</>;
  return <AuthGateInner>{children}</AuthGateInner>;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-ink-mute">
        Loading…
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="font-display text-[32px] text-ink">Sign in to continue</h1>
        <p className="max-w-sm text-[15px] text-ink-soft">
          Use the email address your company account was set up with.
        </p>
        <button onClick={() => login()} className={buttonClasses("primary", "lg")}>
          Sign in with email
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
