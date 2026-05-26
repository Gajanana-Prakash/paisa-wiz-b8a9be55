import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";

export const Route = createFileRoute("/_authenticated/client")({ component: ClientLayout });

function ClientLayout() {
  const { loading, role } = useTenant();
  if (loading) return <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  if (role !== "client_owner" && role !== "client_employee") return <Navigate to="/ca/dashboard" />;
  return <Outlet />;
}
