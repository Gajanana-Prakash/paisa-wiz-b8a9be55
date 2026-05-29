import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listCaServices, upsertCaService, deleteCaService } from "@/lib/billing.functions";
import { formatInr } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/ca/billing/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCaServices);
  const upsert = useServerFn(upsertCaService);
  const remove = useServerFn(deleteCaService);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["ca-services"],
    queryFn: () => list({ data: {} }),
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("0");
  const [gst, setGst] = useState("18");
  const [unit, setUnit] = useState("FIXED");
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditId(undefined);
    setName("");
    setDesc("");
    setAmount("0");
    setGst("18");
    setUnit("FIXED");
    setOpen(true);
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setName(s.service_name);
    setDesc(s.description ?? "");
    setAmount(String(s.default_amount));
    setGst(String(s.gst_rate));
    setUnit(s.unit);
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await upsert({
        data: {
          id: editId,
          serviceName: name.trim(),
          description: desc.trim() || null,
          defaultAmount: Number(amount) || 0,
          unit: unit as any,
          gstRate: Number(gst) || 18,
        },
      });
      qc.invalidateQueries({ queryKey: ["ca-services"] });
      setOpen(false);
      toast.success("Service saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    try {
      await remove({ data: { id } });
      qc.invalidateQueries({ queryKey: ["ca-services"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Billing
      </Link>
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Service catalog</h1>
          <p className="text-muted-foreground mt-1">Default rates for GST filing, ITR, audit, and other CA services.</p>
        </div>
        <Button size="sm" className="gap-1" onClick={openNew}><Plus className="size-4" /> Add service</Button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Service</th>
              <th className="px-4 py-2.5 text-left">Unit</th>
              <th className="px-4 py-2.5 text-right">Rate</th>
              <th className="px-4 py-2.5 text-right">GST</th>
              <th className="px-4 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="size-5 animate-spin mx-auto" /></td></tr>
            )}
            {(services as any[]).map((s) => (
              <tr key={s.id} className="border-t border-border even:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.service_name}</div>
                  {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.unit}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(Number(s.default_amount))}</td>
                <td className="px-4 py-3 text-right">{s.gst_rate}%</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(s)}><Pencil className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit service" : "Add service"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Default rate (₹)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">GST %</Label>
                <Input type="number" value={gst} onChange={(e) => setGst(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input px-2 text-sm">
                  {["FIXED", "PER_RETURN", "PER_HOUR", "PER_MONTH"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={save} disabled={busy} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
