import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDscRecords } from "@/lib/dsc.functions";
import { daysRemainingStyle } from "@/lib/dsc.server";
import { AddDscDialog } from "./AddDscDialog";
import { DscDetailDrawer } from "./DscDetailDrawer";

export function ClientDscPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listDscRecords);
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["dsc-records", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          <h2 className="font-display font-semibold">Digital Signature Certificates</h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add DSC
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && records.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No DSCs registered for this client yet.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(records as any[]).map((r) => {
          const ds = daysRemainingStyle(r.days_remaining, r.computed_status === "EXPIRED");
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setDetailId(r.id)}
              className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition"
            >
              <div className="font-medium">{r.holder_name}</div>
              <div className="text-xs text-muted-foreground">{r.holder_designation ?? "—"}</div>
              <div className="mt-3 text-lg font-semibold">{format(new Date(r.expiry_date), "dd MMM yyyy")}</div>
              <span className={`text-xs tabular-nums ${ds.className} ${ds.pulse ? "animate-pulse" : ""}`}>{ds.label}</span>
              {r.token_physical_location && (
                <div className="mt-2 text-xs bg-amber-500/10 text-amber-900 rounded px-2 py-1 truncate">
                  📍 {r.token_physical_location}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <AddDscDialog open={addOpen} onOpenChange={setAddOpen} clientId={clientId} />
      <DscDetailDrawer dscId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}
