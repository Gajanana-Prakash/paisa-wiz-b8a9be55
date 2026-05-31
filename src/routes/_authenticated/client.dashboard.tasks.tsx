import { createFileRoute } from "@tanstack/react-router";
import { ClientPendingTasksPage } from "@/components/client-portal/ClientPendingTasksPage";

export const Route = createFileRoute("/_authenticated/client/dashboard/tasks")({
  component: ClientPendingTasksPage,
});
