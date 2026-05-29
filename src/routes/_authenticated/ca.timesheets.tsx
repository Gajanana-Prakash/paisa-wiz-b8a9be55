import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listActiveTimers, listTimeLogs, stopTimer, listStaff } from "@/lib/timetracking.functions";
import { TimesheetTable } from "@/components/timetracking/TimesheetTable";
import { formatElapsedFromStart, formatMinutes, startOfWeek, endOfWeek, isoDate, utilBg } from "@/components/timetracking/utils";

export const Route = createFileRoute("/_authenticated/ca/timesheets")({ component: TimesheetsPage });

function TimesheetsPage() {
  const qc = useQueryClient();
  const listActive = useServerFn(listActiveTimers);
  const listLogs = useServerFn(listTimeLogs);
  const listStaffFn = useServerFn(listStaff);
  const stop = useServerFn(stopTimer);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const [from, setFrom] = useState(() => isoDate(startOfWeek(new Date())));
  const [to, setTo] = useState(() => isoDate(endOfWeek(new Date())));
  const [staffFilter, setStaffFilter] = useState("");
  const [billableOnly, setBillableOnly] = useState(false);

  const { data: active = [] } = useQuery({
    queryKey: ["active-timers"],
    queryFn: () => listActive({ data: undefined as any }),
    refetchInterval: 15_000,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["time-logs", "firm", from, to, staffFilter, billableOnly],
    queryFn: () => listLogs({ data: { scope: "firm", dateFrom: new Date(from).toISOString(), dateTo: new Date(to + "T23:59:59").toISOString(), staffId: staffFilter || undefined, billableOnly } }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listStaffFn({ data: undefined as any }),
  });

  const handleStop = async (id: string) => {
    try { await stop({ data: { id } }); qc.invalidateQueries({ queryKey: ["active-timers"] }); qc.invalidateQueries({ queryKey: ["time-logs"] }); toast.success("Stopped"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Timesheets</h1>
        <p className="text-muted-foreground mt-1">Track who's working on what, billable hours, and weekly targets.</p>
      </div>

      {active.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Active timers
          </div>
          <div className="space-y-2">
            {active.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 bg-background rounded-xl p-3 border border-border">
                <div className="text-sm">
                  <div className="font-medium">{t.staff_name}</div>
                  <div className="text-muted-foreground text-xs">
                    {t.clients?.business_name ?? "Internal"} {t.tasks?.title ? `· ${t.tasks.title}` : ""} {t.description ? `· ${t.description}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums font-medium text-emerald-700">{formatElapsedFromStart(t.started_at, now)}</span>
                  <Button size="sm" variant="outline" onClick={() => handleStop(t.id)} className="gap-1.5"><Square className="size-3" /> Stop</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" /></div>
            <div><label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" /></div>
            <div><label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Staff</label>
              <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[180px]">
                <option value="">All staff</option>
                {staff.map((s: any) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select></div>
            <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={billableOnly} onChange={(e) => setBillableOnly(e.target.checked)} /> Billable only</label>
          </div>
          <TimesheetTable rows={logs as any} showStaff allowEdit allowDelete />
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 h-fit">
          <div className="text-sm font-semibold mb-3">This week vs target</div>
          <div className="space-y-3">
            {staff.length === 0 && <div className="text-xs text-muted-foreground">No staff yet.</div>}
            {staff.map((s: any) => {
              const targetMin = (s.weekly_target_hours ?? 40) * 60;
              const pct = targetMin > 0 ? Math.min(100, (s.week_minutes / targetMin) * 100) : 0;
              return (
                <div key={s.user_id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatMinutes(s.week_minutes)} / {s.weekly_target_hours}h</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${utilBg(pct)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
