import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { getClientComplianceProfile, upsertClientComplianceProfile } from "@/lib/compliance.functions";
import { toast } from "sonner";

const DEFAULT = {
  is_gst_registered: false,
  is_company: false,
  is_tds_deductor: false,
  has_employees: false,
  is_audit_applicable: false,
  entity_type: "PROPRIETOR" as const,
  gst_filing_frequency: "monthly" as "monthly" | "quarterly",
};

export function ProfileEditor({
  open, onOpenChange, clientId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; clientId: string; onSaved: () => void }) {
  const get = useServerFn(getClientComplianceProfile);
  const save = useServerFn(upsertClientComplianceProfile);
  const [p, setP] = useState({ ...DEFAULT });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const r: any = await get({ data: { clientId } });
      if (r) {
        setP({
          is_gst_registered: !!r.is_gst_registered,
          is_company: !!r.is_company,
          is_tds_deductor: !!r.is_tds_deductor,
          has_employees: !!r.has_employees,
          is_audit_applicable: !!r.is_audit_applicable,
          entity_type: r.entity_type ?? "PROPRIETOR",
          gst_filing_frequency: r.gst_filing_frequency ?? "monthly",
        });
      } else {
        setP({ ...DEFAULT });
      }
    })();
  }, [open, clientId, get]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await save({ data: { clientId, profile: p } });
      toast.success(`Profile saved · ${r.inserted ?? 0} deadlines generated`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compliance profile</DialogTitle>
          <DialogDescription>Saving regenerates this client's compliance calendar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Entity type</Label>
              <Select value={p.entity_type} onValueChange={(v) => setP({ ...p, entity_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROPRIETOR">Proprietor</SelectItem>
                  <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                  <SelectItem value="LLP">LLP</SelectItem>
                  <SelectItem value="PRIVATE_LTD">Private Limited</SelectItem>
                  <SelectItem value="PUBLIC_LTD">Public Limited</SelectItem>
                  <SelectItem value="TRUST">Trust</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GST filing</Label>
              <Select value={p.gst_filing_frequency} onValueChange={(v) => setP({ ...p, gst_filing_frequency: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly (QRMP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {[
            ["is_gst_registered", "GST registered"],
            ["is_company", "Is a company (Pvt Ltd / LLP)"],
            ["is_tds_deductor", "Deducts TDS"],
            ["has_employees", "Has employees (PF / ESI)"],
            ["is_audit_applicable", "Tax audit applicable"],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <Label htmlFor={key} className="cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={(p as any)[key]}
                onCheckedChange={(v) => setP({ ...p, [key]: v })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save & regenerate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}