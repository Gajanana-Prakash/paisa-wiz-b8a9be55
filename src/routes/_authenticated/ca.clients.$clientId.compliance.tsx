import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { listFirmDeadlines, listFirmStaff } from "@/lib/compliance.functions";
import { DeadlineList } from "@/components/compliance/DeadlineList";
import { DeadlineDrawer, type DeadlineRow } from "@/components/compliance/DeadlineDrawer";
import { ProfileEditor } from "@/components/compliance/ProfileEditor";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/compliance")({
  component: ClientCompliancePage,
});

function ClientCompliancePage() {
  const { clientId } = Route.useParams();
  const list = useServerFn(listFirmDeadlines);
  const staffFn = useServerFn(listFirmStaff);

  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [picked, setPicked] = useState<DeadlineRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const refresh = async () => {
    const from = new Date(); from.setDate(from.getDate() - 30);
    const to = new Date(); to.setMonth(to.getMonth() + 12);
    const [r, s] = await Promise.all([
      list({ data: { clientId, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } }),
      staffFn({ data: undefined as any }),
    ]);
    setRows((r as any) ?? []);
    setStaff(s ?? []);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [clientId]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-5">
      <Link to="/ca/clients/$clientId" params={{ clientId }} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" /> Back to client
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Compliance</h1>
          <p className="text-sm text-muted-foreground mt-1">All regulatory deadlines for this client.</p>
        </div>
        <Button className="gap-2" variant="outline" onClick={() => setEditorOpen(true)}>
          <Settings className="size-4" /> Edit compliance profile
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No deadlines yet. Click "Edit compliance profile" to set what applies to this client and we'll auto-generate the calendar.
        </div>
      ) : (
        <DeadlineList rows={rows} staff={staff} onPick={(r) => { setPicked(r); setDrawerOpen(true); }} onChanged={refresh} showClientColumn={false} />
      )}

      <DeadlineDrawer open={drawerOpen} onOpenChange={setDrawerOpen} row={picked} staff={staff} onSaved={refresh} />
      <ProfileEditor open={editorOpen} onOpenChange={setEditorOpen} clientId={clientId} onSaved={refresh} />
    </div>
  );
}