import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getBillingReports } from "@/lib/billing.functions";
import { formatInr } from "@/components/billing/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const Route = createFileRoute("/_authenticated/ca/billing/reports")({
  component: BillingReportsPage,
});

function BillingReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const load = useServerFn(getBillingReports);

  const { data, isLoading } = useQuery({
    queryKey: ["billing-reports", year],
    queryFn: () => load({ data: { year } }),
  });

  const chartData = (data?.monthly ?? []).map((m: any, i: number) => ({
    month: MONTHS[i],
    Invoiced: m.invoiced,
    Collected: m.collected,
  }));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/ca/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Billing
      </Link>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Billing reports</h1>
          <p className="text-muted-foreground mt-1">Collections, outstanding by client, and aging.</p>
        </div>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 w-28 rounded-md border border-input px-3 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-5 h-80">
            <div className="text-sm font-semibold mb-4">Monthly: invoiced vs collected</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatInr(v)} />
                <Legend />
                <Bar dataKey="Invoiced" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm font-semibold mb-3">Client-wise outstanding</div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(data?.clientOutstanding ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No outstanding balances.</p>
                )}
                {(data?.clientOutstanding ?? []).map((c: any) => (
                  <div key={c.client_id} className="flex justify-between text-sm border-b border-border/60 pb-2">
                    <span>{c.client_name}</span>
                    <span className="font-medium tabular-nums text-rose-700">{formatInr(c.outstanding)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm font-semibold mb-3">Aging report</div>
              <dl className="space-y-3 text-sm">
                {[
                  { label: "0–30 days", key: "d0_30" },
                  { label: "31–60 days", key: "d31_60" },
                  { label: "61–90 days", key: "d61_90" },
                  { label: "90+ days", key: "d90_plus" },
                ].map(({ label, key }) => (
                  <div key={key} className="flex justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{formatInr((data?.aging as any)?.[key] ?? 0)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
