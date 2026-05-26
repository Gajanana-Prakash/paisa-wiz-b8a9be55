import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Users, AlertTriangle, CheckCircle2, FileText, FileCheck2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ca/clients")({ component: ClientsPage });

type Row = { gstin: string; name: string; total: number; review: number; validated: number; gst: number };

function ClientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drill, setDrill] = useState<null | "clients" | "invoices" | "ready" | "review">(null);

  const load = async () => {
    const { data } = await supabase.from("invoices").select("buyer_gstin,buyer_name,status,cgst,sgst,igst,cess,total_amount");
    const map = new Map<string, Row>();
    (data ?? []).forEach((i: any) => {
      const key = i.buyer_gstin || "Unregistered buyers";
      const r = map.get(key) ?? { gstin: key, name: i.buyer_name || key, total: 0, review: 0, validated: 0, gst: 0 };
      r.total += 1;
      if (i.status === "review") r.review += 1;
      if (i.status === "validated") r.validated += 1;
      r.gst += Number(i.cgst || 0) + Number(i.sgst || 0) + Number(i.igst || 0) + Number(i.cess || 0);
      if (i.buyer_name) r.name = i.buyer_name;
      map.set(key, r);
    });
    setRows(Array.from(map.values()).sort((a, b) => b.total - a.total));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("clients-invoices")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const totalClients = rows.length;
  const readyClients = rows.filter((r) => r.total > 0 && r.review === 0).length;
  const pendingClients = rows.filter((r) => r.review > 0).length;
  const totalInvoices = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-semibold">Client (Buyer)</h1>
      <p className="text-muted-foreground mt-1">Manage clients, track filing readiness, and see workload at a glance. One workspace, every client.</p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="size-5"/>} label="Total clients" value={totalClients} tone="primary" onClick={() => setDrill("clients")} />
        <StatCard icon={<FileText className="size-5"/>} label="Total invoices" value={totalInvoices} tone="muted" onClick={() => setDrill("invoices")} />
        <StatCard icon={<FileCheck2 className="size-5"/>} label="Filing ready" value={readyClients} tone="success" onClick={() => setDrill("ready")} />
        <StatCard icon={<Clock className="size-5"/>} label="Needs review" value={pendingClients} tone="warn" onClick={() => setDrill("review")} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 p-10 rounded-2xl border border-dashed border-border bg-card text-center">
          <Users className="size-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No client data yet. Upload invoices to see clients grouped by buyer GSTIN.</p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">GSTIN</th>
                <th className="p-4 font-medium text-right">Invoices</th>
                <th className="p-4 font-medium text-right">Pending review</th>
                <th className="p-4 font-medium text-right">Validated</th>
                <th className="p-4 font-medium text-right">GST collected</th>
                <th className="p-4 font-medium">Filing readiness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ready = r.total > 0 && r.review === 0;
                return (
                  <tr key={r.gstin} className="border-t border-border">
                    <td className="p-4 font-medium flex items-center gap-2"><FileText className="size-4 text-muted-foreground"/>{r.name}</td>
                    <td className="p-4 font-mono text-xs">{r.gstin}</td>
                    <td className="p-4 text-right">{r.total}</td>
                    <td className="p-4 text-right">{r.review}</td>
                    <td className="p-4 text-right">{r.validated}</td>
                    <td className="p-4 text-right">₹{r.gst.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                    <td className="p-4">
                      {ready ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full text-xs"><CheckCircle2 className="size-3.5"/>Ready</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full text-xs"><AlertTriangle className="size-3.5"/>{r.review} to review</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BuyerStatDrillDialog drill={drill} onClose={() => setDrill(null)} rows={rows} />
    </div>
  );
}

function StatCard({ icon, label, value, tone, onClick }: { icon: React.ReactNode; label: string; value: number; tone: "primary"|"muted"|"success"|"warn"; onClick?: () => void }) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-foreground/70",
    success: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm disabled:cursor-default disabled:hover:border-border disabled:hover:shadow-none"
    >
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl grid place-items-center ${toneCls}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-semibold font-display">{value.toLocaleString("en-IN")}</div>
        </div>
      </div>
    </button>
  );
}

function BuyerStatDrillDialog({
  drill, onClose, rows,
}: {
  drill: null | "clients" | "invoices" | "ready" | "review";
  onClose: () => void;
  rows: Row[];
}) {
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    if (drill !== "invoices") return;
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,invoice_number,invoice_date,buyer_name,buyer_gstin,vendor_name,total_amount,cgst,sgst,igst,cess,status")
        .order("invoice_date", { ascending: false });
      setInvoices(data || []);
    })();
  }, [drill]);

  const filtered = drill === "ready"
    ? rows.filter((r) => r.total > 0 && r.review === 0)
    : drill === "review"
      ? rows.filter((r) => r.review > 0)
      : rows;

  const title = drill === "clients" ? "All clients (Buyers)"
    : drill === "invoices" ? "All invoices"
    : drill === "ready" ? "Filing-ready clients"
    : drill === "review" ? "Clients needing review"
    : "";
  const desc = drill === "clients" ? "Every buyer that appears in your invoices."
    : drill === "invoices" ? "Every invoice across all buyers."
    : drill === "ready" ? "These clients have no pending invoices and are ready to file."
    : drill === "review" ? "These clients have invoices flagged for review."
    : "";

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        {drill === "invoices" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Invoice #</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Buyer</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{i.invoice_number || "—"}</td>
                    <td className="px-3 py-2">{i.invoice_date || "—"}</td>
                    <td className="px-3 py-2">{i.buyer_name || "—"}</td>
                    <td className="px-3 py-2">{i.vendor_name || "—"}</td>
                    <td className="px-3 py-2 text-right">{fmt(Number(i.total_amount || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Buyer</th>
                  <th className="px-3 py-2 font-medium">GSTIN</th>
                  <th className="px-3 py-2 font-medium text-right">Invoices</th>
                  <th className="px-3 py-2 font-medium text-right">Pending</th>
                  <th className="px-3 py-2 font-medium text-right">Validated</th>
                  <th className="px-3 py-2 font-medium text-right">GST</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.gstin} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.gstin}</td>
                    <td className="px-3 py-2 text-right">{r.total}</td>
                    <td className="px-3 py-2 text-right">{r.review}</td>
                    <td className="px-3 py-2 text-right">{r.validated}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.gst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}