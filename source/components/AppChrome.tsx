"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Brand";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Payouts", href: "/dashboard" },
  { label: "People", href: "/dashboard/people" },
  { label: "Activity", href: "/dashboard/activity" },
  { label: "Settings", href: "/dashboard/settings" },
];

/**
 * Phase 1 replaces this with the company resolved from the signed-in user's
 * Privy token. Until then every session operates as the single default
 * company created by lib/store.ts.
 */
const COMPANY_NAME = "Arcway Sandbox";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppChrome() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 pt-4">
        <Link href="/" className="text-ink">
          <Wordmark />
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink-soft sm:inline">{COMPANY_NAME}</span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-chip border border-emerald-100 bg-emerald-50 text-xs font-semibold text-emerald"
          >
            {initials(COMPANY_NAME)}
          </span>
        </div>
      </div>

      <nav className="mx-auto max-w-6xl px-6">
        <ul className="flex gap-6">
          {TABS.map((tab) => {
            // /dashboard would otherwise match every child route.
            const active =
              tab.href === "/dashboard"
                ? pathname === "/dashboard" || pathname.startsWith("/dashboard/review")
                : pathname.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-block border-b-2 py-3 text-sm transition-colors",
                    active
                      ? "border-emerald font-semibold text-ink"
                      : "border-transparent text-ink-soft hover:text-ink"
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
