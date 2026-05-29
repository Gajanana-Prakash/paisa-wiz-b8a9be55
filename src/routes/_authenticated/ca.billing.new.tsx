import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { InvoiceEditor } from "@/components/billing/InvoiceEditor";

export const Route = createFileRoute("/_authenticated/ca/billing/new")({
  component: NewInvoicePage,
});

function NewInvoicePage() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to billing
      </Link>
      <h1 className="font-display text-3xl font-semibold">New invoice</h1>
      <InvoiceEditor />
    </div>
  );
}
