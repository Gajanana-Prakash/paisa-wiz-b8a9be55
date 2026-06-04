import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateTallyExport } from "@/lib/tally.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, FileDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/tally-export")({
  component: TallyExportPage,
});

function TallyExportPage() {
  const { clientId } = Route.useParams();
  const gen = useServerFn(generateTallyExport);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(); firstOfMonth.setDate(1);
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [sales, setSales] = useState(true);
  const [purchase, setPurchase] = useState(false);
  const [journal, setJournal] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await gen({ data: { clientId, periodFrom: from, periodTo: to, includeSales: sales, includePurchase: purchase, includeJournal: journal } });
      if (r.url) {
        const a = document.createElement("a"); a.href = r.url; a.download = r.fileName; a.click();
        toast.success(`Exported ${r.count} vouchers`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/ca/clients/$clientId" params={{ clientId }}><Button size="icon" variant="ghost"><ArrowLeft /></Button></Link>
        <div>
          <h1 className="text-2xl font-display font-semibold">Export to Tally</h1>
          <p className="text-sm text-muted-foreground">Generates a Tally-compatible voucher XML. Import via Gateway → Import → Data.</p>
        </div>
      </div>

      <div className="rounded-2xl border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2"><Checkbox checked={sales} onCheckedChange={(v) => setSales(!!v)} /> Include sales vouchers</label>
          <label className="flex items-center gap-2 opacity-60"><Checkbox checked={purchase} onCheckedChange={(v) => setPurchase(!!v)} /> Include purchase vouchers</label>
          <label className="flex items-center gap-2 opacity-60"><Checkbox checked={journal} onCheckedChange={(v) => setJournal(!!v)} /> Include journal entries</label>
        </div>
        <Button onClick={run} disabled={busy}><FileDown className="size-4 mr-1.5" />{busy ? "Generating…" : "Generate Tally Export"}</Button>
      </div>
    </div>
  );
}
