import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { getBillingSettings, updateBillingSettings, listClientRetainers, upsertClientRetainer, runRetainerInvoices } from "@/lib/billing.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/ca/settings/billing")({
  component: BillingSettingsPage,
});

function BillingSettingsPage() {
  const { role, firm } = useTenant();
  const isOwner = role === "ca_owner";
  const load = useServerFn(getBillingSettings);
  const save = useServerFn(updateBillingSettings);
  const listRet = useServerFn(listClientRetainers);
  const upsertRet = useServerFn(upsertClientRetainer);
  const runRet = useServerFn(runRetainerInvoices);
  const listClients = useServerFn(listFirmClientsLite);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, refetch } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => load({ data: undefined as any }),
  });

  const { data: retainers = [], refetch: refetchRet } = useQuery({
    queryKey: ["client-retainers"],
    queryFn: () => listRet({ data: undefined as any }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["billing-settings-clients"],
    queryFn: () => listClients({ data: undefined as any }),
  });

  const s = data?.settings;
  const [pan, setPan] = useState("");
  const [gstin, setGstin] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [upiId, setUpiId] = useState("");
  const [invFormat, setInvFormat] = useState("INV-{YEAR}-{NUMBER}");
  const [invNext, setInvNext] = useState("1");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [defaultGst, setDefaultGst] = useState("18");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [retClientId, setRetClientId] = useState("");
  const [retAmount, setRetAmount] = useState("");
  const [retDay, setRetDay] = useState("1");

  useEffect(() => {
    if (!s) return;
    setPan(s.pan ?? "");
    setGstin(s.gstin ?? "");
    setBankName(s.bank_name ?? "");
    setBankAccount(s.bank_account ?? "");
    setBankIfsc(s.bank_ifsc ?? "");
    setAccountHolder(s.account_holder ?? "");
    setUpiId(s.upi_id ?? "");
    setInvFormat(s.invoice_number_format ?? "INV-{YEAR}-{NUMBER}");
    setInvNext(String(s.invoice_next_number ?? 1));
    setPaymentTerms(s.default_payment_terms ?? "");
    setDefaultGst(String(s.default_gst_rate ?? 18));
    setSignatureUrl(s.signature_url ?? null);
  }, [s]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          pan: pan.trim() || null,
          gstin: gstin.trim() || null,
          bankName: bankName.trim() || null,
          bankAccount: bankAccount.trim() || null,
          bankIfsc: bankIfsc.trim() || null,
          accountHolder: accountHolder.trim() || null,
          upiId: upiId.trim() || null,
          invoiceNumberFormat: invFormat.trim(),
          invoiceNextNumber: Number(invNext) || 1,
          defaultPaymentTerms: paymentTerms.trim(),
          defaultGstRate: Number(defaultGst) || 18,
          signatureUrl,
        },
      });
      await refetch();
      toast.success("Billing settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadSignature = async (file: File) => {
    if (!firm || !isOwner) return;
    const path = `${firm.id}/signature-${Date.now()}.png`;
    const { error } = await supabase.storage.from("firm-logos").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("firm-logos").getPublicUrl(path);
    setSignatureUrl(pub.publicUrl);
  };

  const addRetainer = async () => {
    if (!retClientId || !retAmount) {
      toast.error("Select client and amount");
      return;
    }
    try {
      await upsertRet({
        data: {
          clientId: retClientId,
          amount: Number(retAmount),
          dayOfMonth: Number(retDay) || 1,
        },
      });
      refetchRet();
      toast.success("Retainer saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runRetainerBilling = async () => {
    try {
      const r = await runRet({ data: undefined as any });
      toast.success(`Created ${r.createdCount} draft invoice(s)`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/ca/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <h1 className="font-display text-3xl font-semibold">Billing settings</h1>
      <p className="text-muted-foreground text-sm">PAN, GSTIN, bank details, invoice numbering, and retainer billing.</p>

      {!isOwner && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">Only the CA owner can edit billing settings.</div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Firm tax &amp; bank</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label className="text-xs">PAN</Label><Input value={pan} onChange={(e) => setPan(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">GSTIN</Label><Input value={gstin} onChange={(e) => setGstin(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">Bank name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">Account number</Label><Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">IFSC</Label><Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">Account holder</Label><Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div className="md:col-span-2"><Label className="text-xs">UPI ID</Label><Input value={upiId} onChange={(e) => setUpiId(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Invoice defaults</h2>
        <div><Label className="text-xs">Number format</Label><Input value={invFormat} onChange={(e) => setInvFormat(e.target.value)} disabled={!isOwner} className="mt-1 font-mono text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Next sequence #</Label><Input type="number" value={invNext} onChange={(e) => setInvNext(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
          <div><Label className="text-xs">Default GST %</Label><Input type="number" value={defaultGst} onChange={(e) => setDefaultGst(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
        </div>
        <div><Label className="text-xs">Default payment terms</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={!isOwner} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Digital signature</Label>
          <div className="mt-2 flex items-center gap-3">
            {signatureUrl && <img src={signatureUrl} alt="" className="h-12 object-contain border rounded p-1" />}
            <Button type="button" size="sm" variant="outline" disabled={!isOwner} onClick={() => fileRef.current?.click()} className="gap-1">
              <Upload className="size-4" /> Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSignature(f).catch((err) => toast.error(err.message)); }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Firm logo is configured under Branding settings.</p>
        </div>
        <Button onClick={handleSave} disabled={!isOwner || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
        </Button>
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Monthly retainer auto-invoice</h2>
          <p className="text-xs text-muted-foreground">Create draft invoices on the configured day each month (run manually or via scheduled job).</p>
          <div className="grid md:grid-cols-3 gap-3">
            <select value={retClientId} onChange={(e) => setRetClientId(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm">
              <option value="">Client…</option>
              {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
            <Input type="number" placeholder="Amount ₹" value={retAmount} onChange={(e) => setRetAmount(e.target.value)} />
            <Input type="number" placeholder="Day (1-28)" value={retDay} onChange={(e) => setRetDay(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addRetainer}>Save retainer</Button>
            <Button size="sm" onClick={runRetainerBilling}>Run today&apos;s retainers</Button>
          </div>
          <ul className="text-sm space-y-1">
            {(retainers as any[]).map((r) => (
              <li key={r.id} className="text-muted-foreground">
                {r.clients?.business_name} — ₹{r.amount} on day {r.day_of_month}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
