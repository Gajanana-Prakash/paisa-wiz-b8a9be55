import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/dashboard/")({
  beforeLoad: () => {
    throw redirect({ to: "/client/dashboard/home" });
  },
});
