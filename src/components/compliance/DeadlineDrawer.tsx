import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, User } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { updateDeadline } from "@/lib/compliance.functions";
import { CATEGORY_LABEL, TONE_PILL, TONE_LABEL, toneFor, type DeadlineStatus } from "./status";
import { toast } from "sonner";

export type DeadlineRow = {
  id: string;
  client_id: string;
  due_date: string;
  period_label: string;
  status: DeadlineStatus;
  assigned_to: string | null;
  notes: string | null;
  filing_reference: string | null;
  clients: { id: string; business_name: string; gstin: string | null };
  compliance_types: { id: string; name: string; category: string; recurrence: string };
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: DeadlineRow | null;
  staff: Array<{ id: string; name: string }>;
  onSaved: () => void;
};

export function DeadlineDrawer({ open, onOpenChange, row, staff, onSaved }: Props) {
  const update = useServerFn(updateDeadline);
  const [status, setStatus] = useState<DeadlineStatus>("PENDING");
  const [assignedTo, setAssignedTo] = useState<string>("UNASSIGNED");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setStatus(row.status);
    setAssignedTo(row.assigned_to ?? "UNASSIGNED");
    setNotes(row.notes ?? "");
    setReference(row.filing_reference ?? "");
  }, [row]);

  if (!row) return null;

  const tone = toneFor(row.due_date, row.status);

  const save = async (override?: Partial<{ status: DeadlineStatus }>) => {
    setBusy(true);
    try {
      await update({
        data: {
          id: row.id,
          patch: {
            status: override?.status ?? status,
            assigned_to: assignedTo === "UNASSIGNED" ? null : assignedTo,
            notes: notes.trim() || null,
            filing_reference: reference.trim() || null,
          },
        },
      });
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{CATEGORY_LABEL[row.compliance_types.category] ?? row.compliance_types.category}</Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full ${TONE_PILL[tone]}`}>{TONE_LABEL[tone]}</span>
          </div>
          <SheetTitle className="font-display">{row.compliance_types.name}</SheetTitle>
          <SheetDescription className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-3.5" /> {new Date(row.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {row.period_label}
            </span>
            <span className="text-sm">Client: <strong className="text-foreground">{row.clients.business_name}</strong>{row.clients.gstin ? <span className="font-mono text-xs ml-2 text-muted-foreground">{row.clients.gstin}</span> : null}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DeadlineStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><User className="size-3.5" /> Assigned to</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Filing reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ARN / Acknowledgment number" />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this filing…" />
          </div>
        </div>

        <div className="mt-6 flex gap-2 flex-wrap">
          <Button onClick={() => save()} disabled={busy} className="gap-2">
            Save
          </Button>
          {status !== "COMPLETED" && (
            <Button variant="outline" disabled={busy} className="gap-2" onClick={() => save({ status: "COMPLETED" })}>
              <CheckCircle2 className="size-4" /> Mark complete
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}