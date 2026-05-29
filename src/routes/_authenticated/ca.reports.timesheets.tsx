import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clientProfitabilityReport,
  staffUtilizationReport,
  monthlyBillingSummary,
} from "@/lib/timetracking.functions";
import { formatMinutes, inr, isoDate } from "@/components/timetracking/utils";
import { downloadXlsx } from "@/components/timetracking/reportExport";

export const Route = createFileRoute("/_authenticated/ca/reports/timesheets")({
  component: TimeReportsPage,
});

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function TimeReportsPage() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return isoDate(d);
  });
  const [dateTo, setDateTo] = useState(() => isoDate(now));
  const [year, setYear] = useState(now.getFullYear());

  const loadClient = useServerFn(clientProfitabilityReport);
  const loadStaff = useServerFn(staffUtilizationReport);
  const loadMonthly = useServerFn(monthlyBillingSummary);

  const range = useMemo(
    () => ({ dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + "T23:59:59").toISOString() }),
    [dateFrom, dateTo],
  );

  const { data: clientRows = [], isLoading: loadingClients } = useQuery({
    queryKey: ["report-client-profit", range],
    queryFn: () => loadClient({ data: range }),
  });

  const { data: staffRows = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["report-staff-util", range],
    queryFn: () => loadStaff({ data: range }),
  });

  const { data: monthlyRows = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ["report-monthly-billing", year],
    queryFn: () => loadMonthly({ data: { year } }),
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/ca/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to reports
      </Link>

      <div>
        <h1 className="font-display text-3xl font-semibold">Time & billing reports</h1>
        <p className="text-muted-foreground mt-1">Client profitability, staff utilization, and monthly billing summaries.</p>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Client profitability</TabsTrigger>
          <TabsTrigger value="staff">Staff utilization</TabsTrigger>
          <TabsTrigger value="monthly">Monthly billing</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4 mt-4">
          <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <ExportBar
            loading={loadingClients}
            onExport={() =>
              downloadXlsx(`client-profitability-${dateFrom}-${dateTo}.xlsx`, [
                {
                  name: "Clients",
                  rows: (clientRows as any[]).map((r) => ({
                    Client: r.client_name,
                    "Total hours": (r.minutes / 60).toFixed(2),
                    "Billable hours": (r.billable_minutes / 60).toFixed(2),
                    "Billable amount": r.billable_amount,
                  })),
                },
              ])
            }
          />
          <ReportTable
            loading={loadingClients}
            headers={["Client", "Total hours", "Billable hours", "Billable amount"]}
            rows={(clientRows as any[]).map((r) => [
              r.client_name,
              formatMinutes(r.minutes),
              formatMinutes(r.billable_minutes),
              inr(r.billable_amount),
            ])}
          />
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 mt-4">
          <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <ExportBar
            loading={loadingStaff}
            onExport={() =>
              downloadXlsx(`staff-utilization-${dateFrom}-${dateTo}.xlsx`, [
                {
                  name: "Staff",
                  rows: (staffRows as any[]).map((r) => ({
                    Staff: r.staff_name,
                    "Total hours": (r.minutes / 60).toFixed(2),
                    "Billable hours": (r.billable_minutes / 60).toFixed(2),
                    "Billable amount": r.billable_amount,
                    "Target achievement %": r.utilization_pct,
                  })),
                },
              ])
            }
          />
          <ReportTable
            loading={loadingStaff}
            headers={["Staff", "Total hours", "Billable hours", "Target %", "Billable amount"]}
            rows={(staffRows as any[]).map((r) => [
              r.staff_name,
              formatMinutes(r.minutes),
              formatMinutes(r.billable_minutes),
              `${r.utilization_pct}%`,
              inr(r.billable_amount),
            ])}
          />
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4 mt-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
          </div>
          <ExportBar
            loading={loadingMonthly}
            onExport={() =>
              downloadXlsx(`monthly-billing-${year}.xlsx`, [
                {
                  name: "Monthly",
                  rows: (monthlyRows as any[]).map((r, i) => ({
                    Month: MONTH_NAMES[i],
                    "Total hours": (r.minutes / 60).toFixed(2),
                    "Billable hours": (r.billable_minutes / 60).toFixed(2),
                    "Billable amount": Math.round(r.billable_amount * 100) / 100,
                  })),
                },
              ])
            }
          />
          <ReportTable
            loading={loadingMonthly}
            headers={["Month", "Total hours", "Billable hours", "Billable amount"]}
            rows={(monthlyRows as any[]).map((r, i) => [
              MONTH_NAMES[i],
              formatMinutes(r.minutes),
              formatMinutes(r.billable_minutes),
              inr(r.billable_amount),
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DateRangeBar({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
}: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">From</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">To</label>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
      </div>
    </div>
  );
}

function ExportBar({ loading, onExport }: { loading: boolean; onExport: () => void }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" variant="outline" className="gap-2" onClick={onExport} disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
        Export Excel
      </Button>
    </div>
  );
}

function ReportTable({
  loading,
  headers,
  rows,
}: {
  loading: boolean;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-muted-foreground">No data for this period.</td></tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr key={i} className="border-t border-border even:bg-muted/20">
                {row.map((cell, j) => (
                  <td key={j} className={`px-4 py-2.5 ${j > 0 ? "text-right tabular-nums" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
