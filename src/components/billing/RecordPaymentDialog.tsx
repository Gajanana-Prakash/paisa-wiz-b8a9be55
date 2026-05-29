import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recordCaPayment } from "@/lib/billing.functions";
import { formatInr } from "./utils";

const MODES = ["UPI", "BANK_TRANSFER", "CASH", "CHEQUE", "CARD"] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    balance_due: number;
    clients?: { business_name: string } | null;
  } | null;
}) {
  const qc = useQueryClient();
  const record = useServerFn(recordCaPayment);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<(typeof MODES)[number]>("UPI");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    if (!invoice) return;
    setAmount(String(invoice.balance_due));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMode("UPI");
    setRef("");
    setNotes("");
  };

  const submit = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      await record({
        data: {
          invoiceId: invoice.id,
          amount: Number(amount),
          paymentDate,
          paymentMode: mode,
          referenceNumber: ref.trim() || null,
          notes: notes.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["ca-invoices"] });
      qc.invalidateQueries({ queryKey: ["ca-invoice", invoice.id] });
      qc.invalidateQueries({ queryKey: ["billing-dashboard"] });
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        {invoice && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {invoice.invoice_number} · {invoice.clients?.business_name ?? "Client"} · Balance{" "}
              <span className="font-semibold text-foreground">{formatInr(Number(invoice.balance_due))}</span>
            </p>
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Mode</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Reference #</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / cheque no." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </div>
            <Button onClick={submit} disabled={busy} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Save payment"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
