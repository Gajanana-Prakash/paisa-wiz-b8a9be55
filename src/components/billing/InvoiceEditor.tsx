import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  peekNextInvoiceNumber,
  listCaServices,
  saveCaInvoice,
  getBillingSettings,
} from "@/lib/billing.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";
import { formatInr, addDays } from "./utils";
import { computeInvoiceTotals } from "@/lib/billing.calc";
import { HsnRateLookup } from "@/components/gst-library/HsnRateLookup";

type LineRow = {
  key: string;
  serviceId: string;
  description: string;
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
};

function emptyLine(gstRate = 18): LineRow {
  return {
    key: Math.random().toString(36).slice(2),
    serviceId: "",
    description: "",
    hsnSac: "",
    quantity: 1,
    unitPrice: 0,
    gstRate,
  };
}

export function InvoiceEditor({
  invoiceId,
  initial,
}: {
  invoiceId?: string;
  initial?: any;
}) {
  const navigate = useNavigate();
  const save = useServerFn(saveCaInvoice);
  const peekNum = useServerFn(peekNextInvoiceNumber);
  const listServices = useServerFn(listCaServices);
  const listClients = useServerFn(listFirmClientsLite);
  const loadSettings = useServerFn(getBillingSettings);

  const today = new Date().toISOString().slice(0, 10);

  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date ?? today);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? addDays(today, 15));
  const [periodLabel, setPeriodLabel] = useState(initial?.period_label ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [upiLink, setUpiLink] = useState(initial?.upi_link ?? "");
  const [lines, setLines] = useState<LineRow[]>(() =>
    initial?.items?.length
      ? initial.items.map((it: any) => ({
          key: it.id,
          serviceId: it.service_id ?? "",
          description: it.description,
          hsnSac: it.hsn_sac_code ?? "",
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
          gstRate: Number(it.gst_rate),
        }))
      : [emptyLine()],
  );
  const [busy, setBusy] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: () => listClients({ data: undefined as any }),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["ca-services-active"],
    queryFn: () => listServices({ data: { activeOnly: true } }),
  });

  const { data: billingCtx } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => loadSettings({ data: undefined as any }),
  });

  useEffect(() => {
    if (invoiceId || invoiceNumber) return;
    peekNum({ data: undefined as any }).then((r: any) => setInvoiceNumber(r.invoiceNumber)).catch(() => {});
  }, [invoiceId, invoiceNumber, peekNum]);

  useEffect(() => {
    if (!billingCtx?.settings || paymentTerms) return;
    setPaymentTerms(billingCtx.settings.default_payment_terms ?? "Due within 15 days of invoice date");
    if (!upiLink && billingCtx.settings.upi_id) setUpiLink(billingCtx.settings.upi_id);
  }, [billingCtx, paymentTerms, upiLink]);

  const clientGstin = useMemo(() => {
    const c = (clients as any[]).find((x) => x.id === clientId);
    return c?.gstin ?? null;
  }, [clients, clientId]);

  const totals = useMemo(() => {
    const items = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
      }));
    if (!items.length) return null;
    return computeInvoiceTotals(
      items,
      billingCtx?.settings?.gstin ?? null,
      clientGstin,
    );
  }, [lines, billingCtx, clientGstin]);

  const pickService = (key: string, serviceId: string) => {
    const svc = (services as any[]).find((s) => s.id === serviceId);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              serviceId,
              description: svc ? svc.service_name : l.description,
              hsnSac: svc?.hsn_sac_code ?? l.hsnSac,
              unitPrice: svc ? Number(svc.default_amount) : l.unitPrice,
              gstRate: svc ? Number(svc.gst_rate) : l.gstRate,
            }
          : l,
      ),
    );
  };

  const submit = async (sendAfterSave: boolean) => {
    if (!clientId) {
      toast.error("Select a client");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(true);
    try {
      const res = await save({
        data: {
          id: invoiceId,
          clientId,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          dueDate,
          periodLabel: periodLabel.trim() || null,
          paymentTerms: paymentTerms.trim() || null,
          notes: notes.trim() || null,
          upiLink: upiLink.trim() || null,
          sendAfterSave,
          items: validLines.map((l) => ({
            serviceId: l.serviceId || null,
            description: l.description.trim(),
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            gstRate: l.gstRate,
          })),
        },
      });
      toast.success(sendAfterSave ? "Invoice sent" : "Invoice saved");
      navigate({ to: "/ca/billing/$invoiceId", params: { invoiceId: res.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const defaultGst = Number(billingCtx?.settings?.default_gst_rate ?? 18);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Invoice details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Client *</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select client…</option>
              {(clients as any[]).map((c) => (
                <option key={c.id} value={c.id}>{c.business_name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Invoice number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Invoice date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Period label</Label>
            <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="April 2025 Compliance Services" className="mt-1" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Line items</h2>
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setLines((p) => [...p, emptyLine(defaultGst)])}>
            <Plus className="size-4" /> Add item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left py-2">Service</th>
                <th className="text-left py-2 w-24">HSN/SAC</th>
                <th className="text-left py-2">Description</th>
                <th className="text-right py-2 w-20">Qty</th>
                <th className="text-right py-2 w-28">Rate</th>
                <th className="text-right py-2 w-20">GST%</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <select
                      value={l.serviceId}
                      onChange={(e) => pickService(l.key, e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      <option value="">Custom</option>
                      {(services as any[]).map((s) => (
                        <option key={s.id} value={s.id}>{s.service_name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <Input
                      value={l.hsnSac}
                      onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, hsnSac: e.target.value } : x))}
                      className="h-8 font-mono text-xs"
                      placeholder="998231"
                    />
                    <HsnRateLookup
                      code={l.hsnSac}
                      compact
                      onApplyRate={(rate) =>
                        setLines((p) => p.map((x) => (x.key === l.key ? { ...x, gstRate: rate } : x)))
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input value={l.description} onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, description: e.target.value } : x))} className="h-8" />
                  </td>
                  <td className="py-2 pr-2">
                    <Input type="number" value={l.quantity} onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x))} className="h-8 text-right" />
                  </td>
                  <td className="py-2 pr-2">
                    <Input type="number" value={l.unitPrice} onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, unitPrice: Number(e.target.value) } : x))} className="h-8 text-right" />
                  </td>
                  <td className="py-2 pr-2">
                    <Input type="number" value={l.gstRate} onChange={(e) => setLines((p) => p.map((x) => x.key === l.key ? { ...x, gstRate: Number(e.target.value) } : x))} className="h-8 text-right" />
                  </td>
                  <td className="py-2">
                    <Button type="button" size="icon" variant="ghost" className="size-8" disabled={lines.length <= 1} onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totals && (
          <div className="flex justify-end pt-2">
            <div className="text-sm space-y-1 w-56">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatInr(totals.subtotal)}</span></div>
              {totals.isInterState ? (
                <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{formatInr(totals.igstAmount)}</span></div>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{formatInr(totals.cgstAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{formatInr(totals.sgstAmount)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold border-t border-border pt-1"><span>Total</span><span>{formatInr(totals.totalAmount)}</span></div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm">Notes &amp; terms</h2>
        <div>
          <Label className="text-xs">Payment terms</Label>
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Notes to client</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">UPI / payment link</Label>
          <Input value={upiLink} onChange={(e) => setUpiLink(e.target.value)} className="mt-1" />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" disabled={busy} onClick={() => submit(false)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save as draft"}
        </Button>
        <Button disabled={busy} onClick={() => submit(true)} className="gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save & send"}
        </Button>
      </div>
    </div>
  );
}
