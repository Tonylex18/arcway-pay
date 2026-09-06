import { cn } from "@/lib/utils";
import type { PayeeStatus } from "@/lib/types";

const STYLES: Record<PayeeStatus, string> = {
  pending: "bg-ink-100 text-ink-600",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

const LABELS: Record<PayeeStatus, string> = {
  pending: "Pending",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: PayeeStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STYLES[status]
      )}
    >
      {status === "sending" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      )}
      {LABELS[status]}
    </span>
  );
}
