import { createFileRoute } from "@tanstack/react-router";
import { ClientPortalShell } from "@/components/client-portal/ClientPortalShell";

export const Route = createFileRoute("/_authenticated/client/dashboard")({
  component: ClientPortalShell,
});
