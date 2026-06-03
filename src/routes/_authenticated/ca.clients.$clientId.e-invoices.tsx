import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, QrCode, FileDown, XCircle, RefreshCw, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  listClientEInvoices,
  generateIrnForInvoice,
  bulkGenerateIrns,
  cancelIrnForInvoice,
  getEInvoiceForInvoice,
} from "@/lib/einvoice.functions";
import { IrnStatusBadge, DeadlineCountdown, SandboxBanner } from "@/components/einvoice/StatusBadges";
import { QrViewerDialog, CancelIrnDialog, type QrViewerData } from "@/components/einvoice/Dialogs";


export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/e-invoices")({
  component: ClientEInvoicesPage,
});

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" | "ok" }) {
  const toneCls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function ClientEInvoicesPage() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(listClientEInvoices);
  const gen = useServerFn(generateIrnForInvoice);
  const bulk = useServerFn(bulkGenerateIrns);
  const cancel = useServerFn(cancelIrnForInvoice);
  const getOne = useServerFn(getEInvoiceForInvoice);

  const { data, isLoading } = useQuery({
    queryKey: ["einvoice-list", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [qr, setQr] = useState<QrViewerData | null>(null);
  const [cancelInvoice, setCancelInvoice] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const items = data?.items ?? [];
  const pendingIds = useMemo(
    () => items.filter((i) => i.status === "PENDING" || i.status === "FAILED").map((i) => i.invoiceId),
    [items],
  );

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === pendingIds.length) setSelected(new Set());
    else setSelected(new Set(pendingIds));
  };

  const runGenerate = async (invoiceId: string) => {
    setWorking(invoiceId);
    try {
      const res = await gen({ data: { invoiceId } });
      if (res.ok) toast.success(`IRN generated — ${res.irn?.slice(0, 8)}…`);
      else toast.error(`Failed: ${res.errorMessage}`);
      qc.invalidateQueries({ queryKey: ["einvoice-list", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setWorking(null);
    }
  };

  const runBulk = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulk({ data: { invoiceIds: Array.from(selected) } });
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.length - ok;
      toast.success(`${ok} IRNs generated, ${fail} failed`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["einvoice-list", clientId] });
    } finally {
      setBulkBusy(false);
    }
  };

  const openQr = async (invoiceId: string, invoiceNumber: string) => {
    const { eInvoice } = await getOne({ data: { invoiceId } });
    if (!eInvoice || !eInvoice.qr_code_data) {
      toast.error("No QR available");
      return;
    }
    const img = eInvoice.qr_code_image_url ?? (await renderQrDataUrl(eInvoice.qr_code_data));
    setQr({
      irn: eInvoice.irn,
      ackNumber: eInvoice.ack_number,
      ackDate: eInvoice.ack_date,
      qrImage: img,
      signedJson: eInvoice.signed_invoice_json,
      invoiceNumber,
    });
  };

  const runCancel = async (reason: "1" | "2" | "3" | "4", text: string) => {
    if (!cancelInvoice) return;
    setCancelBusy(true);
    try {
      await cancel({ data: { invoiceId: cancelInvoice, reason, reasonText: text } });
      toast.success("IRN cancelled");
      setCancelInvoice(null);
      qc.invalidateQueries({ queryKey: ["einvoice-list", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setCancelBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/ca/clients/$clientId" params={{ clientId }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to client
        </Link>
        <Link to="/ca/settings/e-invoice" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          IRP settings →
        </Link>
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold">e-Invoices</h1>
        <p className="text-muted-foreground text-sm mt-1">Generate IRN, track upload deadlines, and download signed e-invoice JSON.</p>
      </div>

      <SandboxBanner mockMode={data?.mockMode ?? false} sandbox={data?.sandboxMode ?? true} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="IRNs this month" value={data?.summary.generated ?? 0} tone="ok" />
        <StatCard label="Pending IRN" value={data?.summary.pending ?? 0} tone="warn" />
        <StatCard label="Deadline ≤ 7 days" value={data?.summary.deadlineSoon ?? 0} tone="danger" />
        <StatCard label="Cancelled this month" value={data?.summary.cancelled ?? 0} />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-2xl border bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold">{selected.size}</span> selected
          </div>
          <Button size="sm" disabled={bulkBusy} onClick={runBulk}>
            {bulkBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <CheckSquare className="size-4 mr-1.5" />}
            Generate IRN for selected
          </Button>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={pendingIds.length > 0 && selected.size === pendingIds.length}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Deadline</th>
              <th className="px-3 py-2">IRN</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No invoices yet for this client.
                </td>
              </tr>
            )}
            {items.map((row) => {
              const canSelect = row.status === "PENDING" || row.status === "FAILED";
              return (
                <tr key={row.invoiceId} className="border-t">
                  <td className="px-3 py-2">
                    {canSelect && (
                      <Checkbox checked={selected.has(row.invoiceId)} onCheckedChange={() => toggle(row.invoiceId)} />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.invoiceNumber}</td>
                  <td className="px-3 py-2">{row.invoiceDate}</td>
                  <td className="px-3 py-2">{row.buyerName}</td>
                  <td className="px-3 py-2">{fmt(row.totalAmount)}</td>
                  <td className="px-3 py-2"><IrnStatusBadge status={row.status} /></td>
                  <td className="px-3 py-2"><DeadlineCountdown deadline={row.uploadDeadline} days={row.daysRemaining} /></td>
                  <td className="px-3 py-2 font-mono text-xs" title={row.irn ?? undefined}>
                    {row.irn ? `${row.irn.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {(row.status === "PENDING" || row.status === "FAILED") && (
                        <Button
                          size="sm"
                          variant={row.status === "FAILED" ? "destructive" : "default"}
                          disabled={working === row.invoiceId}
                          onClick={() => runGenerate(row.invoiceId)}
                        >
                          {working === row.invoiceId ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : row.status === "FAILED" ? (
                            <><RefreshCw className="size-3.5 mr-1" />Retry</>
                          ) : (
                            "Generate IRN"
                          )}
                        </Button>
                      )}
                      {row.status === "GENERATED" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openQr(row.invoiceId, row.invoiceNumber)}>
                            <QrCode className="size-3.5 mr-1" /> QR
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openQr(row.invoiceId, row.invoiceNumber)}>
                            <FileDown className="size-3.5 mr-1" /> JSON
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setCancelInvoice(row.invoiceId)}>
                            <XCircle className="size-3.5 mr-1" /> Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <QrViewerDialog open={!!qr} onOpenChange={(v) => !v && setQr(null)} data={qr} />
      <CancelIrnDialog open={!!cancelInvoice} onOpenChange={(v) => !v && setCancelInvoice(null)} onConfirm={runCancel} busy={cancelBusy} />
    </div>
  );
}
