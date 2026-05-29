import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { KeyRound, Plus, Eye, RefreshCw, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listDscRecords,
  getDscDashboard,
  processDscAutomations,
  getRenewalAlertPayload,
  markDscRenewed,
} from "@/lib/dsc.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";
import { daysRemainingStyle } from "@/lib/dsc.server";
import { AddDscDialog } from "@/components/dsc/AddDscDialog";
import { DscDetailDrawer } from "@/components/dsc/DscDetailDrawer";
import { whatsappLink, mailtoLink } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/ca/dsc-vault")({ component: DscVaultPage });

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    EXPIRING_SOON: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    EXPIRED: "bg-muted text-muted-foreground line-through",
    REVOKED: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status.replace("_", " ")}</Badge>;
}

function DscVaultPage() {
  const qc = useQueryClient();
  const load = useServerFn(listDscRecords);
  const loadDash = useServerFn(getDscDashboard);
  const runAuto = useServerFn(processDscAutomations);
  const alertFn = useServerFn(getRenewalAlertPayload);
  const renew = useServerFn(markDscRenewed);
  const listClients = useServerFn(listFirmClientsLite);

  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: dash } = useQuery({
    queryKey: ["dsc-dashboard"],
    queryFn: () => loadDash({ data: undefined as any }),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["dsc-records", statusFilter, clientFilter, expiryMonth, search],
    queryFn: () =>
      load({
        data: {
          status: statusFilter as any || undefined,
          clientId: clientFilter || undefined,
          expiryMonth: expiryMonth || undefined,
          search: search.trim() || undefined,
        },
      }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["firm-clients-lite"],
    queryFn: () => listClients({ data: undefined as any }),
  });

  const cards = useMemo(
    () => [
      { label: "Active DSCs", value: dash?.active ?? 0, tone: "text-foreground" },
      { label: "Expiring in 30 days", value: dash?.expiring30 ?? 0, tone: "text-orange-600" },
      { label: "Expiring in 7 days", value: dash?.expiring7 ?? 0, tone: "text-rose-700" },
      { label: "Expired", value: dash?.expired ?? 0, tone: "text-rose-900" },
    ],
    [dash],
  );

  const handleAuto = async () => {
    try {
      const r = await runAuto({ data: undefined as any });
      qc.invalidateQueries({ queryKey: ["dsc-records"] });
      qc.invalidateQueries({ queryKey: ["dsc-dashboard"] });
      toast.success(`Automation complete — ${r.notificationsCreated} notification(s)`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const sendAlert = async (id: string) => {
    try {
      const p = await alertFn({ data: { id } });
      if (p.phone) window.open(whatsappLink(p.phone, p.message), "_blank");
      else if (p.email) {
        const m = mailtoLink(p.email, `DSC renewal — ${p.holderName}`, p.message);
        if (m) window.location.href = m;
      } else {
        await navigator.clipboard.writeText(p.message);
        toast.success("Copied alert text");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const quickRenew = async (id: string, currentExpiry: string) => {
    const next = prompt("New expiry date (YYYY-MM-DD):", currentExpiry);
    if (!next) return;
    try {
      await renew({ data: { id, newExpiryDate: next } });
      qc.invalidateQueries({ queryKey: ["dsc-records"] });
      toast.success("Renewed");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <KeyRound className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold">DSC Vault</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Secure registry of digital signature certificates, USB tokens, and renewal tracking.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAuto}>Run expiry checks</Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add DSC
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className={`text-3xl font-bold tabular-nums mt-1 ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Input placeholder="Search holder or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-9" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm">
          <option value="">All statuses</option>
          {["ACTIVE", "EXPIRING_SOON", "EXPIRED", "REVOKED"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm min-w-[160px]">
          <option value="">All clients</option>
          {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
        <input type="month" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm" />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Client / Holder</th>
                <th className="px-3 py-2.5">DSC holder</th>
                <th className="px-3 py-2.5">Designation</th>
                <th className="px-3 py-2.5">Authority</th>
                <th className="px-3 py-2.5">Issue</th>
                <th className="px-3 py-2.5">Expiry</th>
                <th className="px-3 py-2.5 text-center">Days left</th>
                <th className="px-3 py-2.5">Token location</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto" /></td></tr>
              )}
              {!isLoading && (records as any[]).length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">No DSC records yet.</td></tr>
              )}
              {(records as any[]).map((r) => {
                const ds = daysRemainingStyle(r.days_remaining, r.computed_status === "EXPIRED");
                const clientLabel = r.clients?.business_name ?? (r.client_id ? "—" : "CA Firm");
                return (
                  <tr key={r.id} className="border-t border-border even:bg-muted/15 hover:bg-muted/25">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{clientLabel}</td>
                    <td className="px-3 py-2.5">{r.holder_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.holder_designation ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.issuing_authority ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{format(new Date(r.issue_date), "dd MMM yy")}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-semibold text-base">{format(new Date(r.expiry_date), "dd MMM yyyy")}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex min-w-[3rem] justify-center tabular-nums text-sm ${ds.className} ${ds.pulse ? "animate-pulse rounded-full px-2 py-0.5 bg-rose-500/15" : ""}`}>
                        {ds.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <span className="text-xs font-medium text-amber-900 bg-amber-500/10 rounded px-1.5 py-0.5 line-clamp-2">
                        {r.token_physical_location || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(r.computed_status)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <Button size="icon" variant="ghost" className="size-7" title="View" onClick={() => setDetailId(r.id)}><Eye className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="size-7" title="Renewed" onClick={() => quickRenew(r.id, r.expiry_date)}><RefreshCw className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="size-7" title="Alert" onClick={() => sendAlert(r.id)}><MessageCircle className="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddDscDialog open={addOpen} onOpenChange={setAddOpen} />
      <DscDetailDrawer dscId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}
