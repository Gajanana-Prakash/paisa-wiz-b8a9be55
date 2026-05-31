import { createFileRoute } from "@tanstack/react-router";
import { ClientFilingsPage } from "@/components/client-portal/ClientFilingsPage";

export const Route = createFileRoute("/_authenticated/client/dashboard/filings")({
  component: ClientFilingsPage,
});
