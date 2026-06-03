import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { getEInvoiceDashboard } from "@/lib/einvoice.functions";
import { SandboxBanner } from "@/components/einvoice/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/e-invoices")({
  component: EInvoiceDashboardPage,
});

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" | "ok" }) {
  const toneCls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function EInvoiceDashboardPage() {
  const load = useServerFn(getEInvoiceDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["einvoice-dashboard"],
    queryFn: () => load(),
  });

  if (isLoading)
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  const summary = data?.summary ?? { active: 0, pending: 0, deadlineAlert: 0, failed: 0 };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">e-Invoice Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">IRN status across all clients.</p>
        </div>
        <Link to="/ca/settings/e-invoice" className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
          IRP settings →
        </Link>
      </div>

      <SandboxBanner mockMode={data?.mockMode ?? false} sandbox />

      {summary.deadlineAlert > 0 && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="size-5" />
          <div className="flex-1 text-sm">
            <strong>{summary.deadlineAlert}</strong> invoices have an IRN upload deadline within 7 days.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active IRNs (month)" value={summary.active} tone="ok" />
        <StatCard label="Pending IRN" value={summary.pending} tone="warn" />
        <StatCard label="Deadline ≤ 7 days" value={summary.deadlineAlert} tone="danger" />
        <StatCard label="Failed IRN" value={summary.failed} tone="danger" />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">GSTIN</th>
              <th className="px-3 py-2 text-right">Generated</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Deadline alert</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.byClient ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No clients yet.
                </td>
              </tr>
            )}
            {(data?.byClient ?? [])
              .slice()
              .sort((a, b) => (b.deadlineAlert - a.deadlineAlert) || (b.pending - a.pending))
              .map((row) => (
                <tr key={row.clientId} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.businessName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.gstin ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{row.generated}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={row.pending > 0 ? "text-amber-700 font-semibold" : ""}>{row.pending}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={row.deadlineAlert > 0 ? "text-rose-700 font-semibold" : ""}>{row.deadlineAlert}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/ca/clients/$clientId/e-invoices"
                      params={{ clientId: row.clientId }}
                      className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                    >
                      View <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
