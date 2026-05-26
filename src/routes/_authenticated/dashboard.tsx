import { createFileRoute, redirect } from "@tanstack/react-router";

// Role-aware redirect to /ca/dashboard or /client/dashboard. Tenant context
// is loaded client-side, so we resolve in the component using localStorage-free
// fallback by sending CA-side by default; the role-gated layouts handle bounce.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => { throw redirect({ to: "/ca/dashboard" }); },
});
