import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFirmDeadlines, listFirmStaff, getComplianceSummary } from "@/lib/compliance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, List, AlertTriangle, Clock, CalendarClock, CheckCircle2 } from "lucide-react";
import { CalendarGrid } from "@/components/compliance/CalendarGrid";
import { DeadlineList } from "@/components/compliance/DeadlineList";
import { DeadlineDrawer, type DeadlineRow } from "@/components/compliance/DeadlineDrawer";

export const Route = createFileRoute("/_authenticated/ca/compliance-calendar")({
  component: CompliancePage,
});

function CompliancePage() {
  const list = useServerFn(listFirmDeadlines);
  const staffFn = useServerFn(listFirmStaff);
  const summaryFn = useServerFn(getComplianceSummary);

  const [view, setView] = useState<"calendar" | "list">(
    typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "calendar",
  );
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [summary, setSummary] = useState({ overdue: 0, dueThisWeek: 0, dueThisMonth: 0, completedThisMonth: 0 });
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [assignedTo, setAssignedTo] = useState("ALL");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DeadlineRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const range = useMemo(() => {
    if (view === "calendar") {
      const from = new Date(month.getFullYear(), month.getMonth(), 1);
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    const from = new Date(); from.setDate(from.getDate() - 30);
    const to = new Date(); to.setMonth(to.getMonth() + 4);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, [view, month]);

  const refresh = async () => {
    const [r, s, sum] = await Promise.all([
      list({ data: { ...range, category, status, assignedTo, search } }),
      staffFn({ data: undefined as any }),
      summaryFn({ data: undefined as any }),
    ]);
    setRows((r as any) ?? []);
    setStaff(s ?? []);
    setSummary(sum);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [range.from, range.to, category, status, assignedTo, search]);

  const open = (r: DeadlineRow) => { setPicked(r); setDrawerOpen(true); };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Compliance calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">Every GST, TDS, Income Tax, ROC, PF/ESI and audit deadline across your firm.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} className="gap-1.5" onClick={() => setView("calendar")}>
            <CalendarDays className="size-3.5" /> Calendar
          </Button>
          <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="gap-1.5" onClick={() => setView("list")}>
            <List className="size-3.5" /> List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<AlertTriangle className="size-4" />} label="Overdue" value={summary.overdue} tone="red" />
        <SummaryCard icon={<Clock className="size-4" />} label="Due this week" value={summary.dueThisWeek} tone="orange" />
        <SummaryCard icon={<CalendarClock className="size-4" />} label="Due this month" value={summary.dueThisMonth} tone="yellow" />
        <SummaryCard icon={<CheckCircle2 className="size-4" />} label="Completed this month" value={summary.completedThisMonth} tone="green" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap gap-2 items-center">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            <SelectItem value="GST">GST</SelectItem>
            <SelectItem value="TDS">TDS</SelectItem>
            <SelectItem value="ITR">Income Tax</SelectItem>
            <SelectItem value="ROC_MCA">ROC / MCA</SelectItem>
            <SelectItem value="PF_ESI">PF / ESI</SelectItem>
            <SelectItem value="AUDIT">Audit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Anyone</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search client or filing…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
      </div>

      {view === "calendar" ? (
        <CalendarGrid month={month} onMonth={setMonth} rows={rows} onPick={open} />
      ) : (
        <DeadlineList rows={rows} staff={staff} onPick={open} onChanged={refresh} />
      )}

      <DeadlineDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        row={picked}
        staff={staff}
        onSaved={refresh}
      />
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "red" | "orange" | "yellow" | "green" }) {
  const cls = {
    red:    "bg-destructive/10 text-destructive",
    orange: "bg-warning/15 text-warning",
    yellow: "bg-amber-500/10 text-amber-600",
    green:  "bg-success/10 text-success",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-semibold font-display">{value.toLocaleString("en-IN")}</div>
        </div>
      </div>
    </div>
  );
}