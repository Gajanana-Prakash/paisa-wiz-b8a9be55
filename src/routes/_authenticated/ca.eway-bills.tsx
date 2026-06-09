import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { getEwayBillDashboard } from "@/lib/eway.functions";
import { EwbSandboxBanner, EwbStatusBadge, TransportModeIcon, ValidityCountdown } from "@/components/eway/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/eway-bills")({
  component: EwayBillsDashboardPage,
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

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function EwayBillsDashboardPage() {
  const load = useServerFn(getEwayBillDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["ewb-dashboard"],
    queryFn: () => load(),
  });

  if (isLoading)
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  const summary = data?.summary ?? { active: 0, expiringToday: 0, expiringWeek: 0, cancelled: 0 };
  const items = data?.items ?? [];
  const expiringSoon = items.filter(
    (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24,
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">E-Way Bill Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">EWB activity across all your clients.</p>
        </div>
        <Link to="/ca/settings/eway-bill" className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
          EWB settings →
        </Link>
      </div>

      <EwbSandboxBanner mockMode={data?.mockMode ?? false} sandbox />

      {expiringSoon.length > 0 && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5" />
          <div className="flex-1 text-sm">
            <strong>🚨 {expiringSoon.length} e-way bills expire within 24 hours</strong>
            <ul className="mt-2 space-y-0.5 text-xs">
              {expiringSoon.slice(0, 5).map((i) => (
                <li key={i.id}>
                  EWB {i.ewbNumber} · {i.clientName} · {i.fromPlace || "—"} → {i.toPlace || "—"} · vehicle {i.vehicleNumber ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active EWBs" value={summary.active} tone="ok" />
        <StatCard label="Expiring Today" value={summary.expiringToday} tone="danger" />
        <StatCard label="Expiring This Week" value={summary.expiringWeek} tone="warn" />
        <StatCard label="Cancelled" value={summary.cancelled} />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">EWB No</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Vehicle</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Valid Until</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No e-way bills yet.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">{r.clientName}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ewbNumber}</td>
                <td className="px-3 py-2">
                  {r.fromPlace ?? "—"} <span className="text-muted-foreground">→</span> {r.toPlace ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.vehicleNumber ?? "—"}</td>
                <td className="px-3 py-2"><TransportModeIcon mode={r.transportMode} /></td>
                <td className="px-3 py-2">{fmt(r.totalValue)}</td>
                <td className="px-3 py-2"><ValidityCountdown validUntil={r.ewbValidUntil} hours={r.hoursRemaining} /></td>
                <td className="px-3 py-2"><EwbStatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/ca/clients/$clientId/eway-bills"
                    params={{ clientId: r.clientId }}
                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                  >
                    Open <ArrowRight className="size-3" />
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
