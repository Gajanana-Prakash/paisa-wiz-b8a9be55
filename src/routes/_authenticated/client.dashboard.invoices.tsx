import { createFileRoute } from "@tanstack/react-router";
import { ClientInvoicesPage } from "@/components/client-portal/ClientInvoicesPage";

export const Route = createFileRoute("/_authenticated/client/dashboard/invoices")({
  component: ClientInvoicesPage,
});
