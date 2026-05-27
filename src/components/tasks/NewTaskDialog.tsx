import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { createTask } from "@/lib/tasks.functions";
import { TYPE_LABELS } from "./utils";

export function NewTaskDialog({
  open, onOpenChange, defaultClientId, clients, staff, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultClientId?: string | null;
  clients: { id: string; business_name: string }[];
  staff: { id: string; name: string }[];
  onCreated?: () => void;
}) {
  const create = useServerFn(createTask);
  const [busy, setBusy] = useState(false);
  const [internal, setInternal] = useState(!defaultClientId ? false : false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    client_id: defaultClientId || "",
    task_type: "OTHER",
    priority: "MEDIUM",
    assigned_to: "",
    due_date: "",
    estimated_hours: "",
    period_label: "",
    is_recurring: false,
    recurrence_rule: "MONTHLY",
  });

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Task title is required"); return; }
    setBusy(true);
    try {
      await create({ data: {
        title: form.title.trim(),
        description: form.description || null,
        client_id: internal ? null : (form.client_id || null),
        task_type: form.task_type as any,
        priority: form.priority as any,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        period_label: form.period_label || null,
        is_recurring: form.is_recurring,
        recurrence_rule: form.is_recurring ? form.recurrence_rule : null,
      } });
      toast.success("Task created");
      setForm({ ...form, title: "", description: "", due_date: "", estimated_hours: "", period_label: "" });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to create task");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New task</DialogTitle>
          <DialogDescription>Assign work to a staff member and track it on the board.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox id="internal" checked={internal} onCheckedChange={(v) => setInternal(!!v)} />
            <Label htmlFor="internal" className="text-sm cursor-pointer">Internal task (not tied to a client)</Label>
          </div>
          {!internal && (
            <div>
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Prepare GSTR-1 for ABC Traders" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Estimated hours</Label>
              <Input type="number" step="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Priority</Label>
            <RadioGroup value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })} className="grid grid-cols-4 gap-2 mt-1">
              {(["LOW","MEDIUM","HIGH","URGENT"] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value={p} id={`p-${p}`} />
                  <span className="text-xs font-medium">{p[0] + p.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label>Period label</Label>
            <Input value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} placeholder="April 2025" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="recur" checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: !!v })} />
            <Label htmlFor="recur" className="text-sm cursor-pointer">Recurring task</Label>
          </div>
          {form.is_recurring && (
            <div>
              <Label>Frequency</Label>
              <Select value={form.recurrence_rule} onValueChange={(v) => setForm({ ...form, recurrence_rule: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="ANNUAL">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
