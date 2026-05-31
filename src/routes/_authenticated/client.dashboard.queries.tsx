import { createFileRoute } from "@tanstack/react-router";
import { ClientQueriesPage } from "@/components/client-portal/ClientQueriesPage";

export const Route = createFileRoute("/_authenticated/client/dashboard/queries")({
  component: ClientQueriesPage,
});
