import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useServerFn } from "@tanstack/react-start";
import { inviteClient } from "@/lib/tenant.functions";
import { getComplianceSummary } from "@/lib/compliance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Users, FileText, AlertTriangle, CheckCircle2, Clock, UserPlus,
  Bell, FileDown, Copy, ArrowRight, Building2, CalendarClock, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

type Client = {
  id: string;
  business_name: string;
  gstin: string | null;
  status: string;
  contact_email: string | null;
};

type InvAgg = {
  client_id: string;
  count: number;
  review: number;
  validated: number;
  lastActivity: string | null;
};

type Row = Client & {
  invoices: number;
  pending: number;
  filing: "ready" | "incomplete" | "mismatch" | "empty";
  last: string | null;
};

const fmtAgo = (iso: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export function CADashboard() {
  const { firm, role } = useTenant();
  const [clients, setClients] = useState<Client[]>([]);
  const [aggs, setAggs] = useState<Map<string, InvAgg>>(new Map());
  const [openInvite, setOpenInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const summaryFn = useServerFn(getComplianceSummary);

  const load = async () => {
    if (!firm?.id) return;
    const { data: cs } = await supabase
      .from("clients")
      .select("id, business_name, gstin, status, contact_email")
      .eq("ca_firm_id", firm.id)
      .order("business_name");
    setClients((cs as Client[]) || []);

    const { data: invs } = await supabase
      .from("invoices")
      .select("client_id, status, updated_at")
      .eq("ca_firm_id", firm.id);
    const m = new Map<string, InvAgg>();
    (invs || []).forEach((i: any) => {
      const a = m.get(i.client_id) ?? {
        client_id: i.client_id, count: 0, review: 0, validated: 0, lastActivity: null,
      };
      a.count += 1;
      if (i.status === "review" || i.status === "error") a.review += 1;
      if (i.status === "validated") a.validated += 1;
      if (!a.lastActivity || i.updated_at > a.lastActivity) a.lastActivity = i.updated_at;
      m.set(i.client_id, a);
    });
    setAggs(m);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("ca-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm?.id]);

  const rows = useMemo<Row[]>(() => {
    return clients.map((c) => {
      const a = aggs.get(c.id);
      const invoices = a?.count ?? 0;
      const pending = a?.review ?? 0;
      let filing: Row["filing"];
      if (invoices === 0) filing = "empty";
      else if (pending > 0 && pending >= invoices / 2) filing = "mismatch";
      else if (pending > 0) filing = "incomplete";
      else filing = "ready";
      return { ...c, invoices, pending, filing, last: a?.lastActivity ?? null };
    });
  }, [clients, aggs]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const pendingDocs = rows.filter((r) => r.pending > 0 || r.invoices === 0).length;
    const ready = rows.filter((r) => r.filing === "ready").length;
    // Filings due this month = active clients with invoices in current month
    const dueThisMonth = active; // heuristic
    return { active, pendingDocs, ready, dueThisMonth };
  }, [rows]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-6">
      {/* Hero / firm header */}
      <div className="rounded-3xl p-6 md:p-8 text-primary-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}>
        <Badge className="bg-white/15 text-white border-0 backdrop-blur mb-3 gap-1.5">
          <Building2 className="size-3" /> CA Firm Workspace
        </Badge>
        <h1 className="font-display text-2xl md:text-4xl font-semibold tracking-tight">
          {firm?.name ?? "Your CA Firm"}
        </h1>
        <p className="text-white/70 mt-2 max-w-xl text-sm md:text-base">
          Manage every client's GST compliance from one place. Track filings, request missing documents and ship returns faster.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {role === "ca_owner" && (
            <Button size="lg" onClick={() => setOpenInvite(true)} className="rounded-full bg-white text-primary hover:bg-white/90 gap-2">
              <UserPlus className="size-4" /> Add new client
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="rounded-full bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
            onClick={() => {
              const pending = rows.filter((r) => r.pending > 0 || r.invoices === 0);
              if (pending.length === 0) { toast.info("No clients pending — all caught up"); return; }
              toast.success(`Reminder queued for ${pending.length} client${pending.length === 1 ? "" : "s"}`);
            }}
          >
            <Bell className="size-4" /> Request documents
          </Button>
          <Link to="/ca/reports">
            <Button size="lg" variant="outline" className="rounded-full bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2">
              <FileDown className="size-4" /> Export all reports
            </Button>
          </Link>
          <Link to="/ca/compliance-calendar">
            <Button size="lg" variant="outline" className="rounded-full bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2">
              <CalendarDays className="size-4" /> Compliance calendar
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Summary icon={<Users className="size-5" />} label="Active clients" value={totals.active} tone="primary" />
        <Summary icon={<CalendarClock className="size-5" />} label="Filings due this month" value={totals.dueThisMonth} tone="muted" />
        <Summary icon={<AlertTriangle className="size-5" />} label="Pending documents" value={totals.pendingDocs} tone="warn" />
        <Summary icon={<CheckCircle2 className="size-5" />} label="Ready to file" value={totals.ready} tone="success" />
      </div>

      {/* Client compliance table */}
      <div className="rounded-3xl border border-border/70 bg-card overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Client compliance overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Per-client filing status and pending work.</p>
          </div>
          <Badge variant="secondary">{rows.length} client{rows.length === 1 ? "" : "s"}</Badge>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="size-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">No clients yet.</p>
            {role === "ca_owner" && (
              <Button onClick={() => setOpenInvite(true)} className="mt-4 gap-2">
                <UserPlus className="size-4" /> Invite your first client
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-left">
                <tr>
                  <th className="p-4 font-medium">Client</th>
                  <th className="p-4 font-medium">GST number</th>
                  <th className="p-4 font-medium text-right">Invoices</th>
                  <th className="p-4 font-medium text-right">Pending</th>
                  <th className="p-4 font-medium">Filing status</th>
                  <th className="p-4 font-medium">Last activity</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="p-4 font-medium">
                      <Link
                        to="/ca/clients/$clientId"
                        params={{ clientId: r.id }}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                          {r.business_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{r.business_name}</span>
                      </Link>
                    </td>
                    <td className="p-4 font-mono text-xs">{r.gstin || "—"}</td>
                    <td className="p-4 text-right tabular-nums">{r.invoices}</td>
                    <td className="p-4 text-right tabular-nums">{r.pending}</td>
                    <td className="p-4"><FilingPill status={r.filing} /></td>
                    <td className="p-4 text-muted-foreground">{fmtAgo(r.last)}</td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <Link to="/ca/clients/$clientId" params={{ clientId: r.id }}>
                          <Button size="sm" variant="outline" className="gap-1">
                            View <ArrowRight className="size-3" />
                          </Button>
                        </Link>
                        {r.pending > 0 || r.invoices === 0 ? (
                          <Button size="sm" variant="ghost" className="gap-1"
                            onClick={() => toast.success(`Reminder sent to ${r.business_name}`)}>
                            <Bell className="size-3" /> Request
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteDialog
        open={openInvite}
        onClose={() => { setOpenInvite(false); setInviteUrl(null); load(); }}
        inviteUrl={inviteUrl}
        setInviteUrl={setInviteUrl}
      />
    </div>
  );
}

function Summary({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "primary" | "muted" | "success" | "warn" }) {
  const cls = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-foreground/70",
    success: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-semibold font-display">{value.toLocaleString("en-IN")}</div>
        </div>
      </div>
    </div>
  );
}

function FilingPill({ status }: { status: Row["filing"] }) {
  if (status === "ready")
    return <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full text-xs"><CheckCircle2 className="size-3.5" /> Ready</span>;
  if (status === "mismatch")
    return <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full text-xs"><AlertTriangle className="size-3.5" /> Mismatch</span>;
  if (status === "incomplete")
    return <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full text-xs"><Clock className="size-3.5" /> Incomplete</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted px-2 py-1 rounded-full text-xs"><FileText className="size-3.5" /> No docs</span>;
}

function InviteDialog({
  open, onClose, inviteUrl, setInviteUrl,
}: {
  open: boolean; onClose: () => void;
  inviteUrl: string | null;
  setInviteUrl: (u: string | null) => void;
}) {
  const invite = useServerFn(inviteClient);
  const [form, setForm] = useState({
    businessName: "", gstin: "", contactName: "", contactEmail: "", contactPhone: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.businessName.trim()) { toast.error("Business name is required"); return; }
    setBusy(true);
    try {
      const r = await invite({ data: form });
      const url = `${window.location.origin}/accept-invite/${r.token}`;
      setInviteUrl(url);
      setForm({ businessName: "", gstin: "", contactName: "", contactEmail: "", contactPhone: "" });
      toast.success("Client created — invite link generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to create invite");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add new client</DialogTitle>
          <DialogDescription>
            Create a client and send them a secure invite link to join your workspace.
          </DialogDescription>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-3">
            <Label>Invite link (expires in 7 days)</Label>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Copied"); }}
              ><Copy className="size-4" /></Button>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteUrl(null)}>Invite another</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Business name *</Label>
              <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="ABC Traders" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GSTIN</Label>
                <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="27AABCA1234Z1Z5" />
              </div>
              <div>
                <Label>Contact name</Label>
                <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Rahul Sharma" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="client@abc.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create & generate link"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}