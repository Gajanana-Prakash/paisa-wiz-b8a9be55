import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteAgreementTemplate,
  listAgreementTemplates,
  upsertAgreementTemplate,
} from "@/lib/agreements.functions";
import { AgreementContentEditor } from "@/components/agreements/AgreementContentEditor";
import { AGREEMENT_TYPE_LABELS } from "@/components/agreements/utils";
import { MERGE_TAGS } from "@/lib/agreements.server";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/ca/settings/agreement-templates")({
  component: AgreementTemplatesPage,
});

function AgreementTemplatesPage() {
  const { role } = useTenant();
  const qc = useQueryClient();
  const load = useServerFn(listAgreementTemplates);
  const runUpsert = useServerFn(upsertAgreementTemplate);
  const runDelete = useServerFn(deleteAgreementTemplate);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("SERVICE_AGREEMENT");
  const [content, setContent] = useState("");
  const [validityMonths, setValidityMonths] = useState("12");
  const [busy, setBusy] = useState(false);

  const isOwner = role === "ca_owner";

  const { data, isLoading } = useQuery({
    queryKey: ["agreement-templates"],
    queryFn: () => load({ data: undefined as never }),
  });

  const templates = data?.templates ?? [];

  const openNew = () => {
    setEditId(null);
    setName("");
    setType("CUSTOM");
    setContent("<h1>{CLIENT_NAME} — Agreement</h1>\n<p>Between {CA_FIRM_NAME} and {CLIENT_NAME}.</p>\n<p>Services: {SERVICES_LIST}</p>\n<p>Fee: {FEE_AMOUNT}</p>\n<p>Period: {VALID_FROM} to {VALID_UNTIL}</p>");
    setValidityMonths("12");
    setOpen(true);
  };

  const openEdit = (t: (typeof templates)[0]) => {
    if (t.is_system) { toast.error("System templates cannot be edited"); return; }
    setEditId(t.id);
    setName(t.template_name);
    setType(t.agreement_type);
    setContent(t.content_html);
    setValidityMonths(String(t.validity_months));
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !content.trim()) { toast.error("Name and content required"); return; }
    setBusy(true);
    try {
      await runUpsert({
        data: {
          id: editId ?? undefined,
          templateName: name.trim(),
          agreementType: type as never,
          contentHtml: content,
          validityMonths: Number(validityMonths) || 12,
        },
      });
      toast.success(editId ? "Template updated" : "Template created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["agreement-templates"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await runDelete({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["agreement-templates"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Agreement templates</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage reusable templates for engagement letters and service agreements.</p>
        </div>
        {isOwner && (
          <Button onClick={openNew} className="gap-1"><Plus className="size-4" /> New template</Button>
        )}
      </div>

      {!isOwner && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Only the CA owner can create or edit custom templates.
        </div>
      )}

      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <div className="font-medium mb-2">Template variables</div>
        <div className="flex flex-wrap gap-2">
          {MERGE_TAGS.map((t) => (
            <Badge key={t} variant="secondary" className="font-mono text-xs">{t}</Badge>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {t.template_name}
                  {t.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                  {t.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {AGREEMENT_TYPE_LABELS[t.agreement_type] ?? t.agreement_type} · {t.validity_months} months validity
                </p>
              </div>
              {!t.is_system && isOwner && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => remove(t.id)}><Trash2 className="size-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AGREEMENT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Validity (months)</Label>
                <Input type="number" value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} className="mt-1" />
              </div>
            </div>
            <AgreementContentEditor value={content} onChange={setContent} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
