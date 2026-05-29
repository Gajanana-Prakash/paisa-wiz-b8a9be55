import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Pencil, CreditCard, MessageCircle, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCaInvoice, sendCaInvoice } from "@/lib/billing.functions";
import { InvoicePreview, printInvoicePdf } from "@/components/billing/InvoicePreview";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { RecordPaymentDialog } from "@/components/billing/RecordPaymentDialog";
import { whatsappLink, mailtoLink } from "@/components/billing/utils";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/ca/billing/$invoiceId")({
  component: InvoiceDetailPage,
  validateSearch: (s: Record<string, unknown>) => ({ print: s.print === "1" || s.print === 1 }),
});

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { print } = Route.useSearch();
  const qc = useQueryClient();
  const load = useServerFn(getCaInvoice);
  const send = useServerFn(sendCaInvoice);
  const printRef = useRef<HTMLDivElement>(null);
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ca-invoice", invoiceId],
    queryFn: () => load({ data: { id: invoiceId } }),
  });

  useEffect(() => {
    if (print && data && !isLoading) {
      setTimeout(() => printInvoicePdf(), 400);
    }
  }, [print, data, isLoading]);

  const handleSend = async () => {
    try {
      await send({ data: { id: invoiceId } });
      qc.invalidateQueries({ queryKey: ["ca-invoice", invoiceId] });
      toast.success("Invoice sent to client");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Link to="/ca/billing" className="text-primary text-sm mt-2 inline-block">Back</Link>
      </div>
    );
  }

  const inv = data.invoice;
  const client = inv.clients;
  const msg = `Invoice ${inv.invoice_number} from ${data.firm?.name} — total ${Number(inv.balance_due || inv.total_amount).toLocaleString("en-IN", { style: "currency", currency: "INR" })}. Please arrange payment.`;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-root, #invoice-print-root * { visibility: visible; }
          #invoice-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          header, aside, nav { display: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/ca/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Billing
        </Link>
        <div className="flex flex-wrap gap-2 items-center">
          <InvoiceStatusBadge status={inv.status} />
          {inv.status === "DRAFT" && (
            <>
              <Link to="/ca/billing/$invoiceId/edit" params={{ invoiceId }}>
                <Button size="sm" variant="outline" className="gap-1"><Pencil className="size-3.5" /> Edit</Button>
              </Link>
              <Button size="sm" className="gap-1" onClick={handleSend}><Send className="size-3.5" /> Send</Button>
            </>
          )}
          {Number(inv.balance_due) > 0 && inv.status !== "DRAFT" && inv.status !== "CANCELLED" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setPayOpen(true)}><CreditCard className="size-3.5" /> Record payment</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => printInvoicePdf()}>Download PDF</Button>
          {client?.contact_phone && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(whatsappLink(client.contact_phone, msg), "_blank")}>
              <MessageCircle className="size-3.5" /> WhatsApp
            </Button>
          )}
          {client?.contact_email && mailtoLink(client.contact_email, `Invoice ${inv.invoice_number}`, msg) && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => { window.location.href = mailtoLink(client.contact_email!, `Invoice ${inv.invoice_number}`, msg)!; }}>
              <Mail className="size-3.5" /> Email
            </Button>
          )}
        </div>
      </div>

      <InvoicePreview
        ref={printRef}
        firm={data.firm}
        settings={data.settings}
        invoice={inv}
        items={inv.items ?? []}
      />

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={inv} />
    </div>
  );
}
