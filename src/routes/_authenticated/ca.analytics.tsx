import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getFirmAnalytics } from "@/lib/analytics.functions";
import { useTenant } from "@/hooks/useTenant";
import { formatInr } from "@/components/billing/utils";
import { KpiCard, ChartSkeleton, billableColor, revPerHourColor, riskColor, workloadBarColor } from "@/components/analytics/utils";
import { exportAnalyticsExcel, printAnalyticsReport } from "@/components/analytics/exportReport";
import { CHART_COLORS } from "@/lib/analytics.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileDown, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ca/analytics")({
  component: AnalyticsPage,
});

type Preset = "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "THIS_FY" | "CUSTOM";
type ClientSort = "revenue" | "hours" | "rph";
type StaffFilter = string | null;

const PRESETS: { value: Preset; label: string }[] = [
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "THIS_QUARTER", label: "This quarter" },
  { value: "LAST_QUARTER", label: "Last quarter" },
  { value: "THIS_FY", label: "This financial year" },
  { value: "CUSTOM", label: "Custom range" },
];

function AnalyticsPage() {
  const { role } = useTenant();
  const load = useServerFn(getFirmAnalytics);
  const [preset, setPreset] = useState<Preset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [clientSort, setClientSort] = useState<ClientSort>("revenue");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<StaffFilter>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["firm-analytics", preset, customFrom, customTo],
    queryFn: () =>
      load({
        data: {
          preset,
          customFrom: preset === "CUSTOM" ? customFrom : undefined,
          customTo: preset === "CUSTOM" ? customTo : undefined,
        },
      }),
    staleTime: 60 * 60 * 1000,
    enabled: role === "ca_owner" && (preset !== "CUSTOM" || (!!customFrom && !!customTo)),
  });

  const clients = useMemo(() => {
    if (!data) return [];
    let rows = [...data.clientProfitability.rows];
    if (clientFilter) rows = rows.filter((r) => r.clientId === clientFilter);
    if (clientSort === "hours") rows.sort((a, b) => b.hoursSpent - a.hoursSpent);
    else if (clientSort === "rph") rows.sort((a, b) => b.revenuePerHour - a.revenuePerHour);
    else rows.sort((a, b) => b.totalInvoiced - a.totalInvoiced);
    return rows;
  }, [data, clientSort, clientFilter]);

  const staffRows = useMemo(() => {
    if (!data) return [];
    if (staffFilter) return data.staff.rows.filter((r) => r.userId === staffFilter);
    return data.staff.rows;
  }, [data, staffFilter]);

  if (role !== "ca_owner") {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <BarChart3 className="size-10 mx-auto text-muted-foreground mb-3" />
        <h1 className="font-display text-xl font-semibold">Partner analytics</h1>
        <p className="text-muted-foreground text-sm mt-2">Firm analytics are available to the CA owner only.</p>
        <Link to="/ca/dashboard" className="text-primary text-sm mt-4 inline-block">Back to dashboard</Link>
      </div>
    );
  }

  const rangeLabel = data?.range.label ?? PRESETS.find((p) => p.value === preset)?.label ?? "";

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Firm Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Revenue, profitability, staff performance, and client portfolio intelligence.
            {isFetching && !isLoading && <span className="ml-2 text-xs">Refreshing…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset === "CUSTOM" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px]" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px]" />
            </>
          )}
          {data && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => printAnalyticsReport(data, rangeLabel)}>
                <FileDown className="size-3.5" /> Download report
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => exportAnalyticsExcel(data, rangeLabel)}>
                <Download className="size-3.5" /> Export data
              </Button>
            </>
          )}
        </div>
      </div>

      {/* §1 Revenue */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Revenue overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total revenue" value={data?.revenue.totalRevenue ?? 0} loading={isLoading} changePct={data?.revenue.revenueChangePct} />
          <KpiCard label="Revenue collected" value={data?.revenue.revenueCollected ?? 0} loading={isLoading} />
          <KpiCard label="Outstanding dues" value={data?.revenue.outstandingDues ?? 0} loading={isLoading} />
          <KpiCard
            label="Period"
            value={rangeLabel}
            sub={data ? `${data.range.from} → ${data.range.to}` : undefined}
            loading={isLoading}
          />
        </div>
        {isLoading ? <ChartSkeleton /> : (
          <div className="rounded-2xl border bg-card p-5 h-80">
            <div className="text-sm font-semibold mb-4">Monthly revenue (last 12 months)</div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={data?.revenue.monthlyRevenue ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatInr(v)} />
                <Legend />
                <Bar dataKey="invoiced" name="Invoiced" fill={CHART_COLORS.invoiced} radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.collected} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* §2 Client profitability */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Client profitability</h2>
          <div className="flex gap-2">
            {clientFilter && (
              <Button size="sm" variant="ghost" onClick={() => setClientFilter(null)}>Clear filter</Button>
            )}
            <Select value={clientSort} onValueChange={(v) => setClientSort(v as ClientSort)}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Sort: Revenue</SelectItem>
                <SelectItem value="hours">Sort: Hours</SelectItem>
                <SelectItem value="rph">Sort: Rev / hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          {isLoading ? <ChartSkeleton /> : (
            <div className="rounded-2xl border bg-card p-5 h-80 lg:col-span-1">
              <div className="text-sm font-semibold mb-2">Revenue distribution</div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie
                    data={data?.clientProfitability.pie ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    onClick={(_, idx) => {
                      const slice = data?.clientProfitability.pie[idx];
                      if (!slice || slice.name === "Others") return;
                      const row = data?.clientProfitability.rows.find((r) => r.clientName === slice.name);
                      if (row) setClientFilter(row.clientId);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {(data?.clientProfitability.pie ?? []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatInr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="lg:col-span-2 rounded-2xl border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium text-right">Invoiced</th>
                  <th className="px-4 py-2 font-medium text-right">Paid</th>
                  <th className="px-4 py-2 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-2 font-medium text-right">Hours</th>
                  <th className="px-4 py-2 font-medium text-right">Rev/hr</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && clients.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No client data for this period.</td></tr>
                )}
                {clients.slice(0, 20).map((r) => (
                  <tr key={r.clientId} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.clientName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(r.totalInvoiced)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(r.totalPaid)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(r.outstanding)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.hoursSpent.toFixed(1)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${revPerHourColor(r.revenuePerHour, data?.clientProfitability.avgRevPerHour ?? 0)}`}>
                      {formatInr(r.revenuePerHour)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* §3 Staff */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Staff performance</h2>
          {staffFilter && (
            <Button size="sm" variant="ghost" onClick={() => setStaffFilter(null)}>Show all staff</Button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Team hours" value={data?.staff.kpis.totalTeamHours ?? 0} loading={isLoading} sub="hours" />
          <KpiCard label="Billable hours %" value={`${data?.staff.kpis.billablePct ?? 0}%`} loading={isLoading} />
          <KpiCard label="Avg tasks / staff" value={data?.staff.kpis.avgTasksPerStaff ?? 0} loading={isLoading} />
          <KpiCard label="Overdue tasks" value={data?.staff.kpis.overdueTasksTotal ?? 0} loading={isLoading} />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {isLoading ? <ChartSkeleton /> : (
            <div className="rounded-2xl border bg-card p-5 h-72">
              <div className="text-sm font-semibold mb-2">Staff workload (hours)</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={data?.staff.workload ?? []} layout="vertical" margin={{ left: 8 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <ReferenceLine x={data?.staff.hourTarget ?? 160} stroke="#64748b" strokeDasharray="4 4" label="Target" />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {(data?.staff.workload ?? []).map((entry, i) => (
                      <Cell key={i} fill={workloadBarColor(entry.hours, entry.target)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="rounded-2xl border bg-card overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Staff</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-right">Billable %</th>
                  <th className="px-3 py-2 text-right">Done</th>
                  <th className="px-3 py-2 text-right">Overdue</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((r) => (
                  <tr
                    key={r.userId}
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => setStaffFilter(r.userId)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.designation}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.hours}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${billableColor(r.billablePct)}`}>{r.billablePct}%</td>
                    <td className="px-3 py-2 text-right">{r.tasksCompleted}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{r.tasksOverdue}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.revenueGenerated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* §4 Compliance */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Compliance performance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="On time" value={`${data?.compliance.kpis.onTimePct ?? 0}%`} loading={isLoading} />
          <KpiCard label="Late" value={`${data?.compliance.kpis.latePct ?? 0}%`} loading={isLoading} />
          <KpiCard label="Pending filings" value={data?.compliance.kpis.pending ?? 0} loading={isLoading} />
          <KpiCard
            label="Avg days early (+) / late (−)"
            value={data?.compliance.kpis.avgDaysEarlyLate ?? 0}
            loading={isLoading}
          />
        </div>
        <div className="rounded-2xl border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Completed</th>
                <th className="px-4 py-2 text-right">On time</th>
                <th className="px-4 py-2 text-right">Late</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-left w-40">On-time rate</th>
              </tr>
            </thead>
            <tbody>
              {(data?.compliance.byCategory ?? []).map((r) => (
                <tr key={r.category} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.category}</td>
                  <td className="px-4 py-2 text-right">{r.completed}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{r.onTime}</td>
                  <td className="px-4 py-2 text-right text-rose-600">{r.late}</td>
                  <td className="px-4 py-2 text-right">{r.pending}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${r.onTimeRate}%` }} />
                      </div>
                      <span className="text-xs tabular-nums w-10">{r.onTimeRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* §5 Portfolio */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Client portfolio</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Active clients" value={data?.portfolio.kpis.activeClients ?? 0} loading={isLoading} />
          <KpiCard label="Added this period" value={data?.portfolio.kpis.clientsAdded ?? 0} loading={isLoading} />
          <KpiCard label="With overdue items" value={data?.portfolio.kpis.clientsWithOverdue ?? 0} loading={isLoading} />
          <KpiCard label="Clients / staff" value={data?.portfolio.kpis.avgClientsPerStaff ?? 0} loading={isLoading} />
          {data?.portfolio.avgClientQueryRating != null && (
            <KpiCard
              label="Client query satisfaction"
              value={`${data.portfolio.avgClientQueryRating} / 5`}
              loading={isLoading}
              sub={`${data.portfolio.queryRatingsCount ?? 0} ratings`}
            />
          )}
        </div>
        <div className="grid lg:grid-cols-4 gap-6">
          {!isLoading && data && (
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="text-sm font-semibold">Client health</div>
              {[
                { label: "All compliant", count: data.portfolio.healthDistribution.green, color: "bg-emerald-500" },
                { label: "Minor pending", count: data.portfolio.healthDistribution.yellow, color: "bg-amber-500" },
                { label: "Overdue / issues", count: data.portfolio.healthDistribution.red, color: "bg-rose-500" },
              ].map((h) => (
                <div key={h.label} className="flex items-center gap-3 text-sm">
                  <div className={`size-3 rounded-full ${h.color}`} />
                  <span className="flex-1">{h.label}</span>
                  <span className="font-semibold tabular-nums">{h.count}</span>
                </div>
              ))}
            </div>
          )}
          <div className="lg:col-span-3 rounded-2xl border bg-card overflow-x-auto">
            <div className="px-4 py-3 border-b font-semibold text-sm">Client risk radar</div>
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left">Client</th>
                  <th className="px-4 py-2 text-right">Filings</th>
                  <th className="px-4 py-2 text-right">Notices</th>
                  <th className="px-4 py-2 text-right">Invoice</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2 text-center">Risk</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(data?.portfolio.riskRadar ?? []).slice(0, 15).map((r) => (
                  <tr key={r.clientId} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.clientName}</td>
                    <td className="px-4 py-2 text-right">{r.overdueFilings}</td>
                    <td className="px-4 py-2 text-right">{r.openNotices}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(r.outstandingInvoice)}</td>
                    <td className="px-4 py-2 text-right">{r.overdueTasks}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${riskColor(r.riskScore)}`}>
                        {r.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link to="/ca/clients/$clientId" params={{ clientId: r.clientId }} className="text-primary text-xs hover:underline">
                        View client
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* §6 Billing */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Billing &amp; collections</h2>
        <div className="grid lg:grid-cols-2 gap-6">
          {isLoading ? <ChartSkeleton /> : (
            <div className="rounded-2xl border bg-card p-5 h-72">
              <div className="text-sm font-semibold mb-2">Invoice aging</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={data?.billing.aging ?? []}>
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatInr(v)} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {(data?.billing.aging ?? []).map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="rounded-2xl border bg-card overflow-x-auto max-h-72 overflow-y-auto">
            <div className="px-4 py-3 border-b font-semibold text-sm">Top outstanding invoices</div>
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(data?.billing.topOutstanding ?? []).map((r) => (
                  <tr key={r.invoiceId} className="border-t">
                    <td className="px-3 py-2">{r.clientName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.amount)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{r.daysOutstanding}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/ca/billing/$invoiceId"
                        params={{ invoiceId: r.invoiceId }}
                        className="text-primary text-xs hover:underline"
                      >
                        Remind
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* §7 Growth */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Growth metrics</h2>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <KpiCard
            label="MoM revenue growth"
            value={data?.growth.momRevenueGrowth != null ? `${data.growth.momRevenueGrowth}%` : "—"}
            loading={isLoading}
          />
          <KpiCard label="Client retention (12m+)" value={`${data?.growth.retentionRate ?? 0}%`} loading={isLoading} />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {isLoading ? (
            <>
              <ChartSkeleton />
              <ChartSkeleton />
            </>
          ) : (
            <>
              <div className="rounded-2xl border bg-card p-5 h-72">
                <div className="text-sm font-semibold mb-2">Client acquisition (24 months)</div>
                <ResponsiveContainer width="100%" height="90%">
                  <ComposedChart data={data?.growth.clientAcquisition ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="right" dataKey="newClients" name="New clients" fill={CHART_COLORS.primaryLight} />
                    <Line yAxisId="left" type="monotone" dataKey="cumulative" name="Cumulative" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-2xl border bg-card p-5 h-72">
                <div className="text-sm font-semibold mb-2">Revenue growth (24 months)</div>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={data?.growth.revenueGrowth24 ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatInr(v)} />
                    <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS.collected} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
