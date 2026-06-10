import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import {
  listReconRules, upsertReconRule, deleteReconRule, updateReconSettings,
} from "@/lib/bank.functions";

export const Route = createFileRoute("/_authenticated/ca/settings/bank-reconciliation")({
  component: BankReconSettingsPage,
});

const CATEGORIES = [
  "SALES_RECEIPT", "PURCHASE_PAYMENT", "TAX_PAYMENT", "SALARY",
  "BANK_CHARGES", "LOAN", "INTEREST", "UNKNOWN",
];

function BankReconSettingsPage() {
  const listFn = useServerFn(listReconRules);
  const saveSettings = useServerFn(updateReconSettings);
  const del = useServerFn(deleteReconRule);

  const q = useQuery({ queryKey: ["recon-rules"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<any | null>(null);
  const [tolerance, setTolerance] = useState<number>(1);
  const [excludeBelow, setExcludeBelow] = useState<number>(0);
  const [dateWindow, setDateWindow] = useState<number>(30);

  // populate settings when data loads
  if (q.data && tolerance === 1 && q.data.settings.match_tolerance !== 1) {
    setTolerance(Number(q.data.settings.match_tolerance));
    setExcludeBelow(Number(q.data.settings.auto_exclude_below));
    setDateWindow(Number(q.data.settings.date_window_days));
  }

  if (q.isLoading) return <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  const canEdit = !!q.data?.canEdit;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/ca/settings" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Back to settings
        </Link>
        <h1 className="font-display text-2xl font-semibold mt-1">Bank Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">Matching tolerance and auto-categorization rules.</p>
      </div>

      {!canEdit && (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Only the firm owner can edit these settings.
        </div>
      )}

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-4">
        <h2 className="font-display text-lg font-semibold">Matching tolerance</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Amount tolerance (₹)</Label>
            <Select value={String(tolerance)} onValueChange={(v) => setTolerance(Number(v))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">±₹1</SelectItem>
                <SelectItem value="10">±₹10</SelectItem>
                <SelectItem value="100">±₹100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Auto-exclude amounts below (₹)</Label>
            <Input type="number" value={excludeBelow} onChange={(e) => setExcludeBelow(Number(e.target.value))} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-xs">Date window (days)</Label>
            <Input type="number" value={dateWindow} onChange={(e) => setDateWindow(Number(e.target.value))} disabled={!canEdit} min={1} max={180} />
          </div>
        </div>
        <Button
          disabled={!canEdit}
          onClick={async () => {
            await saveSettings({ data: { match_tolerance: tolerance, auto_exclude_below: excludeBelow, date_window_days: dateWindow } });
            toast.success("Settings saved");
            q.refetch();
          }}
        >Save settings</Button>
      </section>

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Auto-categorization rules</h2>
            <p className="text-xs text-muted-foreground mt-1">Recurring transactions matching these rules get categorized automatically.</p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setEditing({})} className="gap-1">
              <Plus className="size-4" /> Add rule
            </Button>
          )}
        </div>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Description contains</th>
                <th className="p-3 text-left">Amount range</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.rules || []).length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">No rules yet.</td></tr>
              )}
              {(q.data?.rules || []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.rule_name}</td>
                  <td className="p-3 text-xs"><code>{r.description_contains}</code></td>
                  <td className="p-3 text-xs">
                    {r.amount_min ?? "—"} – {r.amount_max ?? "—"}
                  </td>
                  <td className="p-3 text-xs">{r.category.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="p-3">
                    <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Off"}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    {canEdit && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { await del({ data: { id: r.id } }); toast.success("Deleted"); q.refetch(); }}>
                          <Trash2 className="size-3" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <RuleDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); q.refetch(); }}
        />
      )}
    </div>
  );
}

function RuleDialog({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(upsertReconRule);
  const [name, setName] = useState(initial.rule_name || "");
  const [contains, setContains] = useState(initial.description_contains || "");
  const [min, setMin] = useState<string>(initial.amount_min != null ? String(initial.amount_min) : "");
  const [max, setMax] = useState<string>(initial.amount_max != null ? String(initial.amount_max) : "");
  const [category, setCategory] = useState<string>(initial.category || "BANK_CHARGES");
  const [active, setActive] = useState<boolean>(initial.is_active ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial.id ? "Edit rule" : "Add rule"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Rule name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label className="text-xs">Description contains</Label>
            <Input value={contains} onChange={(e) => setContains(e.target.value)} placeholder="e.g. GST PMT" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount min (₹)</Label>
              <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount max (₹)</Label>
              <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving || !name.trim() || !contains.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await save({
                  data: {
                    id: initial.id,
                    rule_name: name.trim(),
                    description_contains: contains.trim(),
                    amount_min: min ? Number(min) : null,
                    amount_max: max ? Number(max) : null,
                    category: category as any,
                    is_active: active,
                  },
                });
                toast.success("Saved");
                onSaved();
              } catch (e: any) {
                toast.error(e?.message || "Save failed");
              } finally { setSaving(false); }
            }}
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
