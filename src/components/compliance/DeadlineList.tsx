import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TONE_DOT, TONE_LABEL, TONE_PILL, toneFor, CATEGORY_LABEL } from "./status";
import type { DeadlineRow } from "./DeadlineDrawer";
import { useServerFn } from "@tanstack/react-start";
import { bulkUpdateDeadlines } from "@/lib/compliance.functions";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

type Props = {
  rows: DeadlineRow[];
  staff: Array<{ id: string; name: string }>;
  onPick: (r: DeadlineRow) => void;
  onChanged: () => void;
  showClientColumn?: boolean;
};

function bucket(dateStr: string): "this-week" | "next-week" | "this-month" | "later" | "overdue" {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "this-week";
  if (days <= 14) return "next-week";
  if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) return "this-month";
  return "later";
}

const BUCKET_ORDER: Array<{ key: ReturnType<typeof bucket>; label: string }> = [
  { key: "overdue",   label: "Overdue" },
  { key: "this-week", label: "This Week" },
  { key: "next-week", label: "Next Week" },
  { key: "this-month",label: "Later This Month" },
  { key: "later",     label: "Later" },
];

export function DeadlineList({ rows, staff, onPick, onChanged, showClientColumn = true }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useServerFn(bulkUpdateDeadlines);

  const groups = useMemo(() => {
    const m = new Map<string, DeadlineRow[]>();
    for (const r of rows) {
      const k = bucket(r.due_date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markComplete = async () => {
    if (selected.size === 0) return;
    try {
      await bulk({ data: { ids: Array.from(selected), patch: { status: "COMPLETED" } } });
      toast.success(`Marked ${selected.size} as complete`);
      setSelected(new Set());
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Could not update");
    }
  };

  const reassign = async (userId: string) => {
    if (selected.size === 0) return;
    try {
      await bulk({ data: { ids: Array.from(selected), patch: { assigned_to: userId === "UNASSIGNED" ? null : userId } } });
      toast.success(`Reassigned ${selected.size} deadline${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Could not reassign");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        No deadlines match these filters.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {selected.size > 0 && (
        <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-2 sticky top-2 z-10">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" className="gap-2" onClick={markComplete}>
            <CheckCircle2 className="size-4" /> Mark complete
          </Button>
          <Select onValueChange={reassign}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {BUCKET_ORDER.map(({ key, label }) => {
        const items = groups.get(key);
        if (!items || items.length === 0) return null;
        return (
          <section key={key}>
            <h3 className="font-display font-semibold mb-2 text-sm flex items-center gap-2">
              {label} <span className="text-xs text-muted-foreground">· {items.length}</span>
            </h3>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground text-left text-xs">
                    <tr>
                      <th className="p-3 w-8"></th>
                      {showClientColumn && <th className="p-3 font-medium">Client</th>}
                      <th className="p-3 font-medium">Compliance</th>
                      <th className="p-3 font-medium">Period</th>
                      <th className="p-3 font-medium">Due</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const t = toneFor(r.due_date, r.status);
                      const assigned = staff.find((s) => s.id === r.assigned_to);
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-border hover:bg-secondary/30 cursor-pointer"
                          onClick={() => onPick(r)}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggle(r.id)}
                            />
                          </td>
                          {showClientColumn && (
                            <td className="p-3 font-medium">{r.clients.business_name}</td>
                          )}
                          <td className="p-3">
                            <div className="font-medium">{r.compliance_types.name}</div>
                            <div className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.compliance_types.category]}</div>
                          </td>
                          <td className="p-3 text-xs">{r.period_label}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`size-2 rounded-full ${TONE_DOT[t]}`} />
                              {new Date(r.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${TONE_PILL[t]}`}>{TONE_LABEL[t]}</span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{assigned?.name ?? "Unassigned"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}