import type { Payee } from "@/lib/types";
import { formatUsdc, truncateAddress } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export function PayeeTable({ payees }: { payees: Payee[] }) {
  if (payees.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
        No payees yet. Add your first payee above to provision them an embedded
        wallet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-medium">Payee</th>
              <th className="px-4 py-3 font-medium">Embedded wallet</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((payee) => (
              <tr key={payee.id} className="border-b border-ink-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">{payee.name}</div>
                  <div className="text-xs text-ink-500">{payee.email}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-600">
                  {truncateAddress(payee.walletAddress)}
                </td>
                <td className="px-4 py-3 font-tabular text-ink-900">
                  {formatUsdc(payee.amountUsdc)} USDC
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={payee.status} />
                  {payee.status === "failed" && payee.failureReason && (
                    <div className="mt-1 max-w-[220px] text-xs text-red-500">
                      {payee.failureReason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">
                  {new Date(payee.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
