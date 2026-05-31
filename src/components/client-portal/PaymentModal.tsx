import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatInr } from "@/components/billing/utils";
import { submitPaymentProof } from "@/lib/client-portal.functions";

type Invoice = {
  id: string;
  invoice_number: string;
  period_label: string | null;
  balance_due: number;
  total_amount: number;
  due_date: string;
  items?: { description: string; total: number }[];
};

type Billing = {
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  account_holder?: string | null;
  upi_id?: string | null;
} | null;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function PaymentModal({
  invoice,
  billing,
  open,
  onOpenChange,
  onSuccess,
}: {
  invoice: Invoice | null;
  billing: Billing;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const submit = useServerFn(submitPaymentProof);
  const [amount, setAmount] = useState(0);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const due = invoice ? Number(invoice.balance_due || invoice.total_amount) : 0;

  const openChange = (v: boolean) => {
    if (v && invoice) setAmount(due);
    onOpenChange(v);
  };

  const upiId = billing?.upi_id?.trim();
  const upiQrUrl = upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${upiId}&am=${amount}&tn=${invoice?.invoice_number ?? "Invoice"}`)}`
    : null;

  const uploadProof = async () => {
    if (!invoice) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Please choose a screenshot of your payment");
      return;
    }
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      await submit({
        data: {
          invoiceId: invoice.id,
          amount,
          referenceNumber: ref || undefined,
          fileBase64: b64,
          fileName: file.name,
          mimeType: file.type,
        },
      });
      toast.success("Payment proof submitted — your CA will confirm shortly");
      onOpenChange(false);
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto text-base">
        <DialogHeader>
          <DialogTitle className="text-xl">Pay invoice {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            {invoice.period_label && <span>{invoice.period_label} · </span>}
            Due {new Date(invoice.due_date).toLocaleDateString("en-IN")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          {(invoice.items ?? []).map((it, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{it.description}</span>
              <span>{formatInr(Number(it.total))}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold pt-2 border-t">
            <span>Amount due</span>
            <span>{formatInr(due)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pay-amount">Amount to pay</Label>
          <Input
            id="pay-amount"
            type="number"
            min={1}
            step="0.01"
            className="h-11 text-base"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>

        <Tabs defaultValue={upiId ? "upi" : "bank"}>
          <TabsList className="w-full">
            {upiId && <TabsTrigger value="upi" className="flex-1">UPI</TabsTrigger>}
            <TabsTrigger value="bank" className="flex-1">Bank transfer</TabsTrigger>
          </TabsList>
          {upiId && (
            <TabsContent value="upi" className="space-y-4 pt-2">
              {upiQrUrl && (
                <img src={upiQrUrl} alt="UPI QR code" className="mx-auto rounded-lg border" width={200} height={200} />
              )}
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-lg truncate">{upiId}</code>
                <Button type="button" variant="outline" size="icon" onClick={() => copyText(upiId, "UPI ID")}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Scan the QR or copy the UPI ID, then upload proof below.</p>
            </TabsContent>
          )}
          <TabsContent value="bank" className="space-y-3 pt-2 text-sm">
            {[
              ["Account name", billing?.account_holder],
              ["Bank", billing?.bank_name],
              ["Account", billing?.bank_account],
              ["IFSC", billing?.bank_ifsc],
            ].map(([label, val]) =>
              val ? (
                <div key={label} className="flex justify-between gap-2 items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium flex items-center gap-1">
                    {val}
                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => copyText(String(val), label)}>
                      <Copy className="size-3.5" />
                    </Button>
                  </span>
                </div>
              ) : null,
            )}
            {!billing?.bank_account && !billing?.upi_id && (
              <p className="text-muted-foreground">Ask your CA for payment details.</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="border-t pt-4 space-y-3">
          <p className="font-medium">Already paid?</p>
          <div>
            <Label htmlFor="utr">Reference / UTR (optional)</Label>
            <Input id="utr" className="h-11 mt-1" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UTR123456" />
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" />
          <Button className="w-full h-12 text-base gap-2" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-5" />
            Choose payment screenshot
          </Button>
          <Button className="w-full h-12 text-base" disabled={busy} onClick={uploadProof}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : "I have paid — submit proof"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
