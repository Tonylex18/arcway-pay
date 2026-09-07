"use client";

import { useEffect, useState } from "react";
import { PayeeTable } from "@/components/PayeeTable";
import type { Payee } from "@/lib/types";
import { apiFetch } from "@/lib/client-api";

/**
 * The payee directory — everyone on the company's list, regardless of what
 * this run happens to be paying. The Payouts tab is run-centric; this one is
 * person-centric.
 */
export default function PeoplePage() {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/payees");
        const data = await res.json();
        if (!cancelled) setPayees(data.payees ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-ink">
        People
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-[1.6] text-ink-soft">
        Everyone you pay. A wallet exists for each of them from the moment they
        were added; &ldquo;Claimed&rdquo; tracks whether they have signed in to
        take control of it.
      </p>

      <div className="mt-8">
        {loading ? (
          <div className="rounded-card border border-line bg-card p-12 text-center text-[15px] text-ink-mute">
            Loading people…
          </div>
        ) : (
          <PayeeTable
            payees={payees}
            emptyMessage="Nobody here yet. Add a payee from the Payouts tab."
          />
        )}
      </div>
    </div>
  );
}
