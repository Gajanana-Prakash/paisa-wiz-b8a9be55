import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateTimeLog, deleteTimeLog } from "@/lib/timetracking.functions";
import { formatMinutes, inr } from "./utils";

export type TimeLogRow = {
  id: string;
  staff_user_id: string;
  staff_name?: string;
  client_id: string | null;
  task_id: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  billing_rate_per_hour: number;
  billable_amount: number;
  clients?: { business_name: string } | null;
  tasks?: { title: string } | null;
};

export function TimesheetTable({
  rows, showStaff, allowEdit, allowDelete,
}: {
  rows: TimeLogRow[];
  showStaff: boolean;
  allowEdit: boolean;
  allowDelete: boolean;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateTimeLog);
  const del = useServerFn(deleteTimeLog);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDesc, setDraftDesc] = useState("");
  const [draftMin, setDraftMin] = useState(0);
  const [draftBillable, setDraftBillable] = useState(true);
  const [busy, setBusy] = useState(false);

  const totalMin = rows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const billableMin = rows.filter((r) => r.is_billable).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const totalAmt = rows.reduce((s, r) => s + Number(r.billable_amount ?? 0), 0);

  const startEdit = (r: TimeLogRow) => {
    setEditingId(r.id);
    setDraftDesc(r.description ?? "");
    setDraftMin(r.duration_minutes ?? 0);
    setDraftBillable(r.is_billable);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      await update({
        data: {
          id: editingId,
          patch: { description: draftDesc || null, duration_minutes: draftMin, is_billable: draftBillable },
        },
      });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e.message ?? "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this time log?")) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              {showStaff && <th className="px-3 py-2.5">Staff</th>}
              <th className="px-3 py-2.5">Client</th>
              <th className="px-3 py-2.5">Task</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="px-3 py-2.5 text-right">Duration</th>
              <th className="px-3 py-2.5 text-center">Billable</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              {(allowEdit || allowDelete) && <th className="px-3 py-2.5 w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No time logs in this period.</td></tr>
            )}
            {rows.map((r) => {
              const editing = editingId === r.id;
              return (
                <tr key={r.id} className="border-t border-border even:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(r.started_at), "dd MMM")}</td>
                  {showStaff && <td className="px-3 py-2 whitespace-nowrap">{r.staff_name}</td>}
                  <td className="px-3 py-2 whitespace-nowrap">{r.clients?.business_name ?? <span className="text-muted-foreground">Internal</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.tasks?.title ?? "—"}</td>
                  <td className="px-3 py-2 max-w-xs">
                    {editing
                      ? <Input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} className="h-7" />
                      : <span className="truncate block">{r.description ?? <span className="text-muted-foreground">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editing
                      ? <Input type="number" value={draftMin} onChange={(e) => setDraftMin(Number(e.target.value))} className="h-7 w-20 text-right" />
                      : formatMinutes(r.duration_minutes ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editing
                      ? <Switch checked={draftBillable} onCheckedChange={setDraftBillable} />
                      : (r.is_billable
                          ? <span className="inline-block size-2 rounded-full bg-emerald-500" />
                          : <span className="text-muted-foreground text-xs">non-bill</span>)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.is_billable ? inr(Number(r.billable_amount ?? 0)) : "—"}</td>
                  {(allowEdit || allowDelete) && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <Button size="icon" variant="ghost" className="size-7" onClick={saveEdit} disabled={busy}>
                              {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3.5" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(null)}>
                              <X className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            {allowEdit && <Button size="icon" variant="ghost" className="size-7" onClick={() => startEdit(r)}><Pencil className="size-3.5" /></Button>}
                            {allowDelete && <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="size-3.5" /></Button>}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/40 font-medium">
              <tr>
                <td colSpan={showStaff ? 5 : 4} className="px-3 py-2.5 text-right text-muted-foreground">Totals</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(totalMin)}</td>
                <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{formatMinutes(billableMin)} billable</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(totalAmt)}</td>
                {(allowEdit || allowDelete) && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
