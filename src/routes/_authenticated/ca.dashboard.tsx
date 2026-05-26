import { createFileRoute } from "@tanstack/react-router";
import { CADashboard } from "@/components/CADashboard";

export const Route = createFileRoute("/_authenticated/ca/dashboard")({ component: CADashboard });
