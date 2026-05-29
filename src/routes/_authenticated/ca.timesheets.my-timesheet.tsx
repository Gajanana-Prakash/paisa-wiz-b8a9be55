import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTimeLogs, listStaff } from "@/lib/timetracking.functions";
import { TimesheetTable } from "@/components/timetracking/TimesheetTable";
import { LogTimeDialog } from "@/components/timetracking/LogTimeDialog";
import { formatMinutes, startOfWeek, endOfWeek, isoDate, utilBg } from "@/components/timetracking/utils";
import { useTenant } from "@/hooks/useTenant";

export const Route = createFileRoute("/_authenticated/ca/timesheets/my-timesheet")({
  component: MyTimesheetPage,
});

function MyTimesheetPage() {
  const { userId } = useTenant();
  const listLogs = useServerFn(listTimeLogs);
  const listStaffFn = useServerFn(listStaff);

  const [from, setFrom] = useState(() => isoDate(startOfWeek(new Date())));
  const [to, setTo] = useState(() => isoDate(endOfWeek(new Date())));
  const [billableOnly, setBillableOnly] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ["time-logs", "mine", from, to, billableOnly],
    queryFn: () =>
      listLogs({
        data: {
          scope: "mine",
          dateFrom: new Date(from).toISOString(),
          dateTo: new Date(to + "T23:59:59").toISOString(),
          billableOnly,
        },
      }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listStaffFn({ data: undefined as any }),
  });

  const me = useMemo(() => (staff as any[]).find((s) => s.user_id === userId), [staff, userId]);
  const weekMin = me?.week_minutes ?? 0;
  const weekBillable = me?.week_billable_minutes ?? 0;
  const targetMin = (me?.weekly_target_hours ?? 40) * 60;
  const pct = targetMin > 0 ? Math.min(100, (weekMin / targetMin) * 100) : 0;

  const periodTotal = (logs as any[]).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const periodBillable = (logs as any[]).filter((r) => r.is_billable).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My timesheet</h1>
          <p className="text-muted-foreground mt-1">Your logged hours and billable time this week.</p>
        </div>
        <LogTimeDialog />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">This week</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{formatMinutes(weekMin)}</div>
          <div className="text-xs text-muted-foreground mt-1">Target {me?.weekly_target_hours ?? 40}h</div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
            <div className={`h-full ${utilBg(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Billable (week)</div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-emerald-700">{formatMinutes(weekBillable)}</div>
          <div className="text-xs text-muted-foreground mt-1">Non-billable {formatMinutes(Math.max(0, weekMin - weekBillable))}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected period</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{formatMinutes(periodTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{formatMinutes(periodBillable)} billable</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={billableOnly} onChange={(e) => setBillableOnly(e.target.checked)} /> Billable only
        </label>
      </div>

      <TimesheetTable rows={logs as any} showStaff={false} allowEdit allowDelete={false} />
    </div>
  );
}
