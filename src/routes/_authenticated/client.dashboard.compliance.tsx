import { createFileRoute } from "@tanstack/react-router";
import { ClientCompliancePage } from "@/components/client-portal/ClientCompliancePage";

export const Route = createFileRoute("/_authenticated/client/dashboard/compliance")({
  component: ClientCompliancePage,
});
