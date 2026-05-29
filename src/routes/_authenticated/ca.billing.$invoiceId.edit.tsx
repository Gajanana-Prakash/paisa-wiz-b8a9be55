import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getCaInvoice } from "@/lib/billing.functions";
import { InvoiceEditor } from "@/components/billing/InvoiceEditor";

export const Route = createFileRoute("/_authenticated/ca/billing/$invoiceId/edit")({
  component: EditInvoicePage,
});

function EditInvoicePage() {
  const { invoiceId } = Route.useParams();
  const load = useServerFn(getCaInvoice);

  const { data, isLoading } = useQuery({
    queryKey: ["ca-invoice", invoiceId],
    queryFn: () => load({ data: { id: invoiceId } }),
  });

  if (isLoading) {
    return (
      <div className="p-8 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const inv = data?.invoice;
  if (!inv || inv.status !== "DRAFT") {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Only draft invoices can be edited.</p>
        <Link to="/ca/billing/$invoiceId" params={{ invoiceId }} className="text-primary text-sm mt-2 inline-block">View invoice</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/billing/$invoiceId" params={{ invoiceId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-display text-3xl font-semibold">Edit {inv.invoice_number}</h1>
      <InvoiceEditor invoiceId={invoiceId} initial={inv} />
    </div>
  );
}
