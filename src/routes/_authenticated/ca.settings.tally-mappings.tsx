import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMappings, updateMapping, deleteMapping, resetMappings } from "@/lib/tally.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Trash2, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/settings/tally-mappings")({
  component: TallyMappingsPage,
});

function TallyMappingsPage() {
  const load = useServerFn(listMappings);
  const upd = useServerFn(updateMapping);
  const del = useServerFn(deleteMapping);
  const reset = useServerFn(resetMappings);
  const { data, refetch } = useQuery({ queryKey: ["tally-mappings"], queryFn: () => load({}) });
  const rows = ((data as any)?.mappings ?? []) as any[];
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => r.tally_ledger_name.toLowerCase().includes(q.toLowerCase()));

  const save = async (id: string, patch: any) => {
    await upd({ data: { id, ...patch } });
    toast.success("Saved");
    refetch();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this mapping?")) return;
    await del({ data: { id } }); toast.success("Deleted"); refetch();
  };
  const resetAll = async () => {
    if (!confirm("Delete ALL mappings? This cannot be undone.")) return;
    await reset({}); toast.success("Reset"); refetch();
  };
  const exportCsv = () => {
    const csv = ["Ledger,Category,Rate,HSN", ...rows.map((r) => `"${r.tally_ledger_name}",${r.gst_category},${r.gst_rate},${r.hsn_code ?? ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tally-mappings.csv"; a.click();
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/ca/settings"><Button size="icon" variant="ghost"><ArrowLeft /></Button></Link>
          <div>
            <h1 className="text-2xl font-display font-semibold">Tally Ledger Mappings</h1>
            <p className="text-sm text-muted-foreground">Reused across imports for every client in your firm.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-3.5 mr-1.5" />Export CSV</Button>
          <Button variant="destructive" size="sm" onClick={resetAll}><AlertTriangle className="size-3.5 mr-1.5" />Reset All</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="Search ledgers…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Ledger</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2">HSN</th><th /></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">{r.tally_ledger_name}</td>
                <td className="px-3 py-2">
                  <Select defaultValue={r.gst_category} onValueChange={(v) => save(r.id, { category: v, rate: Number(r.gst_rate), hsn: r.hsn_code })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{["SALES","PURCHASE","EXPENSE","ASSET"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2"><Input type="number" defaultValue={r.gst_rate} className="h-8 w-20" onBlur={(e) => save(r.id, { category: r.gst_category, rate: Number(e.target.value), hsn: r.hsn_code })} /></td>
                <td className="px-3 py-2"><Input defaultValue={r.hsn_code ?? ""} className="h-8 w-32" onBlur={(e) => save(r.id, { category: r.gst_category, rate: Number(r.gst_rate), hsn: e.target.value || null })} /></td>
                <td className="px-3 py-2 text-right"><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="size-3.5" /></Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">No mappings yet. They'll appear here after your first Tally import.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
