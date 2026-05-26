import { createFileRoute } from "@tanstack/react-router";
import { ClientPortal } from "@/components/ClientPortal";

export const Route = createFileRoute("/_authenticated/client/dashboard")({ component: ClientPortal });
