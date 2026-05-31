import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Download, FileText, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  cancelCaSubscription,
  changeCaSubscriptionPlan,
  getCaSubscriptionBilling,
} from "@/lib/subscriptions.functions";
import { formatInr, GSTIFY_GSTIN, type PlanType } from "@/lib/subscriptions.plans";

export const Route = createFileRoute("/_authenticated/ca/settings/billing-subscription")({
  component: BillingSubscriptionPage,
});

const PLAN_LABELS: Record<PlanType, string> = {
  FREE: "Free Forever",
  PER_CLIENT: "Per Client",
  STARTER: "Starter",
  GROWTH: "Growth",
  PROFESSIONAL: "Professional",
};

function BillingSubscriptionPage() {
  const { role } = useTenant();
  const isOwner = role === "ca_owner";
  const load = useServerFn(getCaSubscriptionBilling);
  const changePlan = useServerFn(changeCaSubscriptionPlan);
  const cancelSub = useServerFn(cancelCaSubscription);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ca-subscription-billing"],
    queryFn: () => load({ data: undefined as any }),
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Only firm owners can manage subscription billing.</p>
        <Link to="/ca/settings" className="text-sm mt-4 inline-block">
          ← Settings
        </Link>
      </div>
    );
  }

  if (isLoading || !data?.subscription) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sub = data.subscription;
  const plan = sub.plan_type as PlanType;
  const isPerClient = plan === "PER_CLIENT";
  const active = sub.active_client_count ?? 0;
  const limitLabel = isPerClient ? "0 limit" : String(sub.base_clients_included ?? "—");
  const nextBill = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const billingDay = sub.current_period_end
    ? `1st ${new Date(sub.current_period_end).toLocaleString("en-IN", { month: "long" })}`
    : "1st of next month";

  const handlePlan = async (planType: PlanType, downgrade = false) => {
    setBusy(planType);
    try {
      const r = await changePlan({
        data: {
          planType,
          billingCycle: sub.billing_cycle as "MONTHLY" | "ANNUAL",
          immediate: !downgrade,
        },
      });
      toast.success(r.message);
      await qc.invalidateQueries({ queryKey: ["ca-subscription-billing"] });
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not change plan");
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    setBusy("cancel");
    try {
      const r = await cancelSub({ data: undefined as any });
      toast.success(r.message);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not cancel");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <div>
        <Link
          to="/ca/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold">Billing &amp; subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          GST invoice provided for all subscriptions · GSTIN {data.gstin || GSTIFY_GSTIN}
        </p>
      </div>

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="rounded-full uppercase text-[10px] tracking-wider">
              {sub.status}
            </Badge>
            <h2 className="mt-2 font-display text-xl font-semibold">{PLAN_LABELS[plan]}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Next billing date: <span className="text-foreground font-medium">{nextBill}</span>
            </p>
            {data.breakdown ? (
              <p className="text-sm mt-2">
                Estimated bill: <span className="font-semibold">{data.breakdown}</span>
              </p>
            ) : (
              <p className="text-sm mt-2">
                Amount: <span className="font-semibold">{formatInr(sub.monthly_amount ?? 0)}</span>
                {sub.billing_cycle === "ANNUAL" ? " / year" : " / month"}
              </p>
            )}
            {sub.pending_plan_type && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                Pending change to {PLAN_LABELS[sub.pending_plan_type as PlanType]} on next cycle
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/pricing">
              <Button variant="default" size="sm">
                <TrendingUp className="size-4 mr-1" /> Upgrade plan
              </Button>
            </Link>
            <Button variant="outline" size="sm" disabled>
              <Download className="size-4 mr-1" /> Download invoice
            </Button>
          </div>
        </div>

        {isPerClient && (
          <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="font-semibold text-sm">Usage this month</h3>
            <p className="mt-2 text-lg">
              This month&apos;s active clients:{" "}
              <span className="font-bold text-primary">{active}</span> of {limitLabel}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Estimated bill: {active} × {formatInr(sub.per_client_rate ?? 99)} ={" "}
              {formatInr(active * (sub.per_client_rate ?? 99))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Billing date: {billingDay}</p>

            {data.activeClients.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Last activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.activeClients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.businessName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.lastActivityAt
                            ? new Date(c.lastActivityAt).toLocaleDateString("en-IN")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <FileText className="size-4 text-primary" /> Invoices
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          GST-compliant invoices with GSTify GSTIN for your records
        </p>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.period_label}</TableCell>
                  <TableCell>{PLAN_LABELS[inv.plan_type as PlanType]}</TableCell>
                  <TableCell>{inv.active_clients ?? "—"}</TableCell>
                  <TableCell>{formatInr(inv.amount)}</TableCell>
                  <TableCell>{formatInr(inv.gst_amount)}</TableCell>
                  <TableCell className="font-medium">{formatInr(inv.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "PAID" ? "default" : "secondary"}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" disabled title="PDF coming soon">
                      <Download className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold">Change plan</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Upgrades apply immediately (prorated). Downgrades take effect on your next billing cycle.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["PER_CLIENT", "STARTER", "GROWTH", "PROFESSIONAL"] as PlanType[]).map((p) => (
            <Button
              key={p}
              variant={plan === p ? "secondary" : "outline"}
              size="sm"
              disabled={plan === p || busy !== null}
              onClick={() => {
                const down = ["FREE", "PER_CLIENT", "STARTER", "GROWTH", "PROFESSIONAL"].indexOf(p) <
                  ["FREE", "PER_CLIENT", "STARTER", "GROWTH", "PROFESSIONAL"].indexOf(plan);
                handlePlan(p, down);
              }}
            >
              {busy === p && <Loader2 className="size-3 mr-1 animate-spin" />}
              {plan === p ? "Current" : PLAN_LABELS[p]}
            </Button>
          ))}
        </div>
        {plan !== "FREE" && (
          <Button
            variant="ghost"
            className="mt-4 text-destructive hover:text-destructive"
            disabled={busy !== null}
            onClick={handleCancel}
          >
            Cancel subscription (moves to Free at period end)
          </Button>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground pb-8">
        Data stored in India · Cancel anytime · UPI, Net Banking, cards accepted
      </p>
    </div>
  );
}
