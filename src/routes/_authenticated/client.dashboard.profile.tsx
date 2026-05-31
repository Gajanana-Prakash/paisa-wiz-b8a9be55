import { createFileRoute } from "@tanstack/react-router";
import { ClientProfilePage } from "@/components/client-portal/ClientProfilePage";

export const Route = createFileRoute("/_authenticated/client/dashboard/profile")({
  component: ClientProfilePage,
});
