import { createFileRoute } from "@tanstack/react-router";
import { GrowCenterPage } from "@/components/grow/GrowCenterPage";

export const Route = createFileRoute("/_authenticated/ca/grow")({
  component: GrowCenterPage,
});
