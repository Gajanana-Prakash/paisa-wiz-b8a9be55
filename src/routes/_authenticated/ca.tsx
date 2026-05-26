import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";

export const Route = createFileRoute("/_authenticated/ca")({ component: CALayout });

function CALayout() {
  const { loading, role } = useTenant();
  if (loading) return <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  if (role !== "ca_owner" && role !== "ca_staff") return <Navigate to="/client/dashboard" />;
  return <Outlet />;
}
