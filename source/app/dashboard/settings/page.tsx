"use client";

import { useEffect, useState } from "react";
import { Chip, Eyebrow } from "@/components/ui";

/**
 * Shows which integrations are actually live. Deliberately reports mock mode
 * plainly rather than implying a configured treasury — the whole point of the
 * review gate is that the employer can trust what this app tells them.
 */
export default function SettingsPage() {
  const [treasury, setTreasury] = useState<{ amountUsdc: number; mocked: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/treasury");
      if (!cancelled) setTreasury(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const circleMocked = treasury?.mocked ?? true;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-ink">
        Settings
      </h1>

      <div className="mt-8 overflow-hidden rounded-card border border-line bg-card">
        <Row label="Company">
          <span className="text-ink">Arcway Sandbox</span>
        </Row>
        <Row label="USDC settlement">
          <Chip tone={circleMocked ? "amber" : "emerald"}>
            {circleMocked ? "Mock mode" : "Circle connected"}
          </Chip>
        </Row>
        <Row label="Database">
          <Chip tone="emerald">Neon Postgres</Chip>
        </Row>
      </div>

      <p className="mt-6 max-w-xl text-[13px] leading-[1.6] text-ink-mute">
        Company details, team access, and API keys arrive with authentication
        in the next phase. Until then every session operates as a single
        sandbox company.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4 last:border-0">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}
