import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ca/")({
  beforeLoad: () => { throw redirect({ to: "/ca/dashboard" }); },
});
