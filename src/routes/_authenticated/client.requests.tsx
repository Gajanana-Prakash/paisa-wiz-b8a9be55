import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/client/requests")({ component: RequestsPage });

function RequestsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Inbox className="size-3.5" /> Client requests
      </div>
      <h1 className="font-display text-3xl font-semibold mt-1">Requests from your CA</h1>
      <p className="text-muted-foreground mt-1">Document requests, queries and to-dos sent by your CA will appear here.</p>
      <div className="mt-10 p-10 rounded-2xl border border-dashed border-border bg-card text-center">
        <Inbox className="size-8 mx-auto text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">No requests yet. You're all caught up.</p>
      </div>
    </div>
  );
}
