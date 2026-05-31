import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/")({
  beforeLoad: () => { throw redirect({ to: "/client/dashboard/home" }); },
});
