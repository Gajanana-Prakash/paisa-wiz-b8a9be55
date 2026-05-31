import { createFileRoute } from "@tanstack/react-router";
import { ClientHomePage } from "@/components/client-portal/ClientHomePage";

export const Route = createFileRoute("/_authenticated/client/dashboard/home")({
  component: ClientHomePage,
});
