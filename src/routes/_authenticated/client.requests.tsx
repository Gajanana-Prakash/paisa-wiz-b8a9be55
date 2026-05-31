import { createFileRoute } from "@tanstack/react-router";
import { ClientRequestsPage } from "@/components/client-portal/ClientRequestsPage";

export const Route = createFileRoute("/_authenticated/client/requests")({
  component: ClientRequestsPage,
});
