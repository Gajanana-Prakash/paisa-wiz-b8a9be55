import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, ExternalLink, CheckCircle2, Pencil, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/invoices")({ component: Invoices });

const CATEGORY_LABELS: Record<string, string> = {
  sales_invoice: "Sales invoice",
  purchase_bill: "Purchase bill",
  expense_receipt: "Expense receipt",
  bank_statement: "Bank statement",
  asset_purchase: "Asset purchase",
  other: "Other",
};

const EDITABLE_FIELDS = [
  "vendor_name", "vendor_gstin", "buyer_name", "buyer_gstin",
  "invoice_number", "invoice_date", "place_of_supply",
  "taxable_value", "cgst", "sgst", "igst", "cess", "total_amount",
  "document_category",
] as const;

type StatusKey = "uploaded" | "processing" | "review" | "validated" | "approved" | "filed" | "error";

const STATUS_META: Record<StatusKey, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  processing: { label: "Processing…", variant: "secondary" },
  review: { label: "AI Extracted — Pending Review", variant: "destructive" },
  validated: { label: "AI Extracted — Pending Review", variant: "secondary" },
  approved: { label: "Approved — Ready for Export", variant: "default" },
  filed: { label: "Filed", variant: "default" },
  error: { label: "Extraction error", variant: "destructive" },
};

function Invoices() {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");

  const load = async () => {
    const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
    setRows(data || []);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (r: any) => {
    setSelected(r);
    setEditing(false);
    setDraft({});
    setItems([]);
    setFileUrl(null);
    const { data: its } = await supabase.from("invoice_items").select("*").eq("invoice_id", r.id);
    setItems(its || []);
    if (r.file_path) {
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(r.file_path, 3600);
      if (signed?.signedUrl) setFileUrl(signed.signedUrl);
    }
  };

  const startEdit = () => {
    if (!selected) return;
    const d: Record<string, any> = {};
    EDITABLE_FIELDS.forEach((k) => { d[k] = selected[k] ?? ""; });
    setDraft(d);
    setEditing(true);
  };

  const updateField = (k: string, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  const saveDraft = async (alsoApprove: boolean) => {
    if (!selected) return;
    setSaving(true);
    const numericKeys = ["taxable_value", "cgst", "sgst", "igst", "cess", "total_amount"];
    const patch: Record<string, any> = {};
    EDITABLE_FIELDS.forEach((k) => {
      let v = draft[k];
      if (v === "" || v == null) { patch[k] = null; return; }
      if (numericKeys.includes(k)) v = Number(v);
      patch[k] = v;
    });
    if (alsoApprove) {
      patch.status = "approved";
      patch.approved_at = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();
      if (u?.user?.id) patch.approved_by = u.user.id;
    }
    const { data, error } = await supabase.from("invoices").update(patch as any).eq("id", selected.id).select("*").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(alsoApprove ? "Approved — ready for export" : "Changes saved");
    const changedKeys = Object.keys(patch).filter((k) => k !== "status" && k !== "approved_at" && k !== "approved_by");
    if (data?.ca_firm_id && data?.client_id) {
      if (changedKeys.length) {
        await logActivity({
          ca_firm_id: data.ca_firm_id,
          client_id: data.client_id,
          action: "document_edited",
          entity_type: "invoice",
          entity_id: data.id,
          metadata: { invoice_number: data.invoice_number, fields: changedKeys },
        });
      }
      if (alsoApprove) {
        await logActivity({
          ca_firm_id: data.ca_firm_id,
          client_id: data.client_id,
          action: "invoice_approved",
          entity_type: "invoice",
          entity_id: data.id,
          metadata: { invoice_number: data.invoice_number, total: data.total_amount },
        });
      }
    }
    setEditing(false);
    setSelected(data);
    load();
  };

  const approveOnly = async () => {
    if (!selected) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("invoices")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: u?.user?.id ?? null })
      .eq("id", selected.id).select("*").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Approved — ready for export");
    if (data?.ca_firm_id && data?.client_id) {
      await logActivity({
        ca_firm_id: data.ca_firm_id,
        client_id: data.client_id,
        action: "invoice_approved",
        entity_type: "invoice",
        entity_id: data.id,
        metadata: { invoice_number: data.invoice_number, total: data.total_amount },
      });
    }
    setSelected(data);
    load();
  };

  const fmt = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const categoryLabel = (c?: string | null) => (c ? CATEGORY_LABELS[c] ?? c : "—");
  const statusMeta = (s: string) => STATUS_META[s as StatusKey] ?? { label: s, variant: "secondary" as const };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter !== "all" && (r.document_category || "other") !== categoryFilter) return false;
      if (statusFilter === "pending" && !(r.status === "review" || r.status === "validated")) return false;
      if (statusFilter === "approved" && r.status !== "approved") return false;
      return true;
    });
  }, [rows, categoryFilter, statusFilter]);

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === "review" || r.status === "validated").length,
    approved: rows.filter((r) => r.status === "approved").length,
  }), [rows]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl font-semibold">Invoices</h1>
      <p className="text-muted-foreground mt-1">Review AI-extracted invoices, edit if needed, then approve for export.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {([
          ["all", `All (${rows.length})`],
          ["pending", `Pending review (${counts.pending})`],
          ["approved", `Approved (${counts.approved})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setStatusFilter(key as any)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${statusFilter === key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40 hover:bg-secondary/50"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[["all", "All categories"], ...Object.entries(CATEGORY_LABELS)].map(([key, label]) => {
          const count = key === "all" ? rows.length : rows.filter((r) => (r.document_category || "other") === key).length;
          const active = categoryFilter === key;
          return (
            <button key={key} onClick={() => setCategoryFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40 hover:bg-secondary/50"}`}>
              {label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>
              {["Invoice #", "Category", "Vendor", "GSTIN", "Date", "Total", "Status", "Flags"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No invoices in this view.</td></tr>}
            {filtered.map((r) => {
              const sm = statusMeta(r.status);
              return (
                <tr key={r.id} onClick={() => openDetail(r)} className="border-t border-border hover:bg-secondary/30 cursor-pointer">
                  <td className="px-4 py-3 font-medium">{r.invoice_number || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{categoryLabel(r.document_category)}</Badge></td>
                  <td className="px-4 py-3">{r.vendor_name || r.file_name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.vendor_gstin || "—"}</td>
                  <td className="px-4 py-3">{r.invoice_date || "—"}</td>
                  <td className="px-4 py-3">₹{Number(r.total_amount || 0).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3"><Badge variant={sm.variant} className="text-[10px] whitespace-nowrap">{sm.label}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{Array.isArray(r.validation_flags) ? r.validation_flags.length : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const sm = statusMeta(selected.status);
            const isPending = selected.status === "review" || selected.status === "validated";
            const isApproved = selected.status === "approved";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">
                    Invoice {selected.invoice_number || selected.file_name || "—"}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2">
                    <Badge variant={sm.variant}>{sm.label}</Badge>
                    <Badge variant="outline">{categoryLabel(selected.document_category)}</Badge>
                    {selected.invoice_date && <span className="text-xs">Dated {selected.invoice_date}</span>}
                    {selected.confidence != null && (
                      <span className="text-xs inline-flex items-center gap-1 text-muted-foreground">
                        <Sparkles className="size-3" /> AI confidence {Math.round(Number(selected.confidence) * 100)}%
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>

                {/* Action bar */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {!editing && isPending && (
                    <>
                      <Button size="sm" onClick={approveOnly} disabled={saving} className="gap-1.5">
                        <CheckCircle2 className="size-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                        <Pencil className="size-4" /> Edit + Approve
                      </Button>
                    </>
                  )}
                  {!editing && isApproved && (
                    <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                      <Pencil className="size-4" /> Edit fields
                    </Button>
                  )}
                  {editing && (
                    <>
                      <Button size="sm" onClick={() => saveDraft(true)} disabled={saving} className="gap-1.5">
                        <CheckCircle2 className="size-4" /> Save & Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => saveDraft(false)} disabled={saving}>
                        Save changes
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft({}); }} className="gap-1.5">
                        <X className="size-4" /> Cancel
                      </Button>
                    </>
                  )}
                </div>

                {/* Extracted fields */}
                <div className="mt-4 rounded-lg border border-border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Extracted fields</div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    <Field label="Vendor / Supplier name" value={selected.vendor_name} editing={editing}
                      onChange={(v) => updateField("vendor_name", v)} draftVal={draft.vendor_name} />
                    <Field label="Vendor GSTIN" mono value={selected.vendor_gstin} editing={editing}
                      onChange={(v) => updateField("vendor_gstin", v?.toUpperCase?.() ?? v)} draftVal={draft.vendor_gstin} />
                    <Field label="Buyer name" value={selected.buyer_name} editing={editing}
                      onChange={(v) => updateField("buyer_name", v)} draftVal={draft.buyer_name} />
                    <Field label="Buyer GSTIN" mono value={selected.buyer_gstin} editing={editing}
                      onChange={(v) => updateField("buyer_gstin", v?.toUpperCase?.() ?? v)} draftVal={draft.buyer_gstin} />
                    <Field label="Invoice number" value={selected.invoice_number} editing={editing}
                      onChange={(v) => updateField("invoice_number", v)} draftVal={draft.invoice_number} />
                    <Field label="Invoice date" type="date" value={selected.invoice_date} editing={editing}
                      onChange={(v) => updateField("invoice_date", v)} draftVal={draft.invoice_date} />
                    <Field label="Place of supply" value={selected.place_of_supply} editing={editing}
                      onChange={(v) => updateField("place_of_supply", v)} draftVal={draft.place_of_supply} />
                    {editing ? (
                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
                        <select
                          value={draft.document_category || ""}
                          onChange={(e) => updateField("document_category", e.target.value || null)}
                          className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">—</option>
                          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <Field label="Category" value={categoryLabel(selected.document_category)} editing={false} />
                    )}
                  </div>
                </div>

                {/* Amounts */}
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-border space-y-2 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Amounts</div>
                    <AmountRow label="Taxable amount" name="taxable_value" value={selected.taxable_value}
                      editing={editing} draftVal={draft.taxable_value} onChange={updateField} fmt={fmt} />
                    <AmountRow label="CGST" name="cgst" value={selected.cgst}
                      editing={editing} draftVal={draft.cgst} onChange={updateField} fmt={fmt} />
                    <AmountRow label="SGST" name="sgst" value={selected.sgst}
                      editing={editing} draftVal={draft.sgst} onChange={updateField} fmt={fmt} />
                    <AmountRow label="IGST" name="igst" value={selected.igst}
                      editing={editing} draftVal={draft.igst} onChange={updateField} fmt={fmt} />
                    <AmountRow label="CESS" name="cess" value={selected.cess}
                      editing={editing} draftVal={draft.cess} onChange={updateField} fmt={fmt} />
                    <div className="border-t border-border pt-2">
                      <AmountRow label="Total" name="total_amount" value={selected.total_amount}
                        editing={editing} draftVal={draft.total_amount} onChange={updateField} fmt={fmt} bold />
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-border text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Validation</div>
                    {Array.isArray(selected.validation_flags) && selected.validation_flags.length > 0 ? (
                      <ul className="space-y-1">
                        {selected.validation_flags.map((f: any, i: number) => (
                          <li key={i} className="text-destructive text-xs">• {typeof f === "string" ? f : f.code || JSON.stringify(f)}{typeof f === "object" && f.message ? ` — ${f.message}` : ""}</li>
                        ))}
                      </ul>
                    ) : <div className="text-xs text-muted-foreground">No issues detected.</div>}
                    {isApproved && selected.approved_at && (
                      <div className="text-xs text-emerald-600 mt-3 inline-flex items-center gap-1">
                        <CheckCircle2 className="size-3.5" /> Approved on {new Date(selected.approved_at).toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Line items */}
                <div className="mt-4">
                  <h3 className="font-display text-lg font-semibold mb-2">Line items</h3>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-left">
                        <tr>
                          {["#", "Description", "HSN", "Qty", "Unit price", "Taxable", "GST %", "GST amt"].map((h) => (
                            <th key={h} className="px-3 py-2 font-medium text-xs">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground text-xs">No line items extracted.</td></tr>}
                        {items.map((it, i) => (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">{it.description || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{it.hsn || "—"}</td>
                            <td className="px-3 py-2">{Number(it.quantity || 0)}</td>
                            <td className="px-3 py-2">{fmt(it.unit_price)}</td>
                            <td className="px-3 py-2">{fmt(it.taxable_value)}</td>
                            <td className="px-3 py-2">{Number(it.gst_rate || 0)}%</td>
                            <td className="px-3 py-2">{fmt(it.gst_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {fileUrl && (
                  <div className="mt-4 flex gap-2">
                    <Button asChild variant="outline" size="sm"><a href={fileUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4 mr-2"/>Open original</a></Button>
                    <Button asChild variant="outline" size="sm"><a href={fileUrl} download={selected.file_name}><FileDown className="size-4 mr-2"/>Download file</a></Button>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, editing, onChange, draftVal, type, mono }: {
  label: string; value: any; editing: boolean; onChange?: (v: any) => void; draftVal?: any; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {editing && onChange ? (
        <Input type={type || "text"} value={draftVal ?? ""} onChange={(e) => onChange(e.target.value)}
          className={`mt-1 h-9 ${mono ? "font-mono text-xs" : ""}`} />
      ) : (
        <div className={`mt-1 text-sm ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
      )}
    </div>
  );
}

function AmountRow({ label, name, value, editing, draftVal, onChange, fmt, bold }: {
  label: string; name: string; value: any; editing: boolean; draftVal: any;
  onChange: (k: string, v: any) => void; fmt: (n: any) => string; bold?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center gap-2 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {editing ? (
        <Input type="number" step="0.01" value={draftVal ?? ""} onChange={(e) => onChange(name, e.target.value)}
          className="h-8 w-40 text-right tabular-nums" />
      ) : (
        <span className="tabular-nums">{fmt(value)}</span>
      )}
    </div>
  );
}
