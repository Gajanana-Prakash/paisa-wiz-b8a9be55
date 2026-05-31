import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle2, Clock, Bell, FileDown,
  Activity, ClipboardList, Building2, IndianRupee, Plus, Copy, MessageCircle, Mail,
  QrCode, Send, CalendarClock, FolderArchive, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity, type ActivityLog as ActivityLogRow } from "@/lib/activity";
import { ClientCompliancePanel } from "@/components/compliance/ClientCompliancePanel";
import { TasksPage } from "@/components/tasks/TasksPage";
import { ClientCommunicationPanel } from "@/components/communications/ClientCommunicationPanel";
import { ClientDscPanel } from "@/components/dsc/ClientDscPanel";
import { ClientAgreementsPanel } from "@/components/agreements/ClientAgreementsPanel";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getVaultFolderTree } from "@/lib/vault.functions";
import { createDocumentRequest } from "@/lib/document-requests.functions";
import { formatBytes } from "@/components/vault/utils";
import { VAULT_CATEGORIES } from "@/components/vault/categories";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId")({
  component: ClientWorkspace,
});

type Client = {
  id: string; business_name: string; gstin: string | null; status: string;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  created_at: string;
};
type Inv = {
  id: string; invoice_number: string | null; invoice_date: string | null;
  vendor_name: string | null; vendor_gstin: string | null;
  buyer_name: string | null; buyer_gstin: string | null;
  taxable_value: number | null; cgst: number | null; sgst: number | null;
  igst: number | null; cess: number | null; total_amount: number | null;
  status: string; created_at: string; updated_at: string;
};

type DocReq = {
  id: string; doc_type: string; period_label: string | null;
  note: string | null; due_date: string | null; status: string;
  created_at: string; fulfilled_at: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_bills: "Purchase Bills",
  sales_invoices: "Sales Invoices",
  bank_statement: "Bank Statement",
  expense_proofs: "Expense Proofs",
  other: "Other",
};

const fmt = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function ClientWorkspace() {
  const { clientId } = Route.useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: i }] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
        supabase.from("invoices").select("*").eq("client_id", clientId).order("invoice_date", { ascending: false }),
      ]);
      setClient(c as Client | null);
      setInvs((i as Inv[]) || []);
      setLoading(false);
    })();
  }, [clientId]);

  const stats = useMemo(() => {
    const review = invs.filter((i) => i.status === "review" || i.status === "error").length;
    const validated = invs.filter((i) => i.status === "validated").length;
    const gst = invs.reduce((s, i) =>
      s + Number(i.cgst || 0) + Number(i.sgst || 0) + Number(i.igst || 0) + Number(i.cess || 0), 0);
    const taxable = invs.reduce((s, i) => s + Number(i.taxable_value || 0), 0);
    return { total: invs.length, review, validated, gst, taxable };
  }, [invs]);

  const health: "green" | "yellow" | "red" =
    stats.total === 0 ? "yellow"
      : stats.review >= Math.max(1, stats.total / 2) ? "red"
      : stats.review > 0 ? "yellow"
      : "green";

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!client) return (
    <div className="p-8">
      <Link to="/ca/dashboard" className="text-sm text-primary inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Dashboard</Link>
      <div className="mt-6 text-muted-foreground">Client not found.</div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <Link to="/ca/dashboard" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="size-3.5" /> Back to dashboard
      </Link>

      {/* Header */}
      <div className="rounded-3xl border border-border bg-card p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center text-lg font-semibold">
            {client.business_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Building2 className="size-3.5" /> Client workspace
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">{client.business_name}</h1>
            <div className="text-sm text-muted-foreground font-mono mt-1">GSTIN: {client.gstin || "—"}</div>
            {client.contact_name && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Contact: {client.contact_name}{client.contact_email ? ` · ${client.contact_email}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <HealthBadge h={health} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setComposerOpen(true)}>
              <Bell className="size-3.5" /> Request docs
            </Button>
            <Link to="/ca/reports">
              <Button size="sm" className="gap-1.5"><FileDown className="size-3.5" /> Export</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="dsc">DSC</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="gst">GST Reports</TabsTrigger>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KV label="Invoices" value={String(stats.total)} icon={<FileText className="size-4" />} />
            <KV label="Validated" value={String(stats.validated)} icon={<CheckCircle2 className="size-4 text-emerald-600" />} />
            <KV label="Pending review" value={String(stats.review)} icon={<AlertTriangle className="size-4 text-amber-600" />} />
            <KV label="Total GST" value={fmt(stats.gst)} icon={<IndianRupee className="size-4" />} />
          </div>
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display font-semibold mb-3">Client details</h3>
              <dl className="text-sm space-y-2">
                <Row label="Business name" value={client.business_name} />
                <Row label="GSTIN" value={client.gstin || "—"} mono />
                <Row label="Contact" value={client.contact_name || "—"} />
                <Row label="Email" value={client.contact_email || "—"} />
                <Row label="Phone" value={client.contact_phone || "—"} />
                <Row label="Status" value={client.status} />
                <Row label="Added" value={new Date(client.created_at).toLocaleDateString()} />
              </dl>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display font-semibold mb-3">Filing snapshot</h3>
              <dl className="text-sm space-y-2">
                <Row label="Total taxable" value={fmt(stats.taxable)} />
                <Row label="Total GST" value={fmt(stats.gst)} />
                <Row label="Validated invoices" value={String(stats.validated)} />
                <Row label="Needs review" value={String(stats.review)} />
                <Row label="Health" value={health.toUpperCase()} />
              </dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compliance" className="mt-5">
          <ClientCompliancePanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-5">
          <TasksPage title={`Tasks for ${client.business_name}`} fixedClientId={clientId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-5">
          <ClientVaultSummary clientId={clientId} invCount={invs.length} />
        </TabsContent>

        <TabsContent value="agreements" className="mt-5">
          <ClientAgreementsPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="communication" className="mt-5">
          <ClientCommunicationPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="dsc" className="mt-5">
          <ClientDscPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="requests" className="mt-5">
          <RequestsPanel
            clientId={clientId}
            client={client}
            onCompose={() => setComposerOpen(true)}
          />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-5">
          <WhatsAppPanel client={client} />
        </TabsContent>

        <TabsContent value="gst" className="mt-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-display font-semibold">GST reconciliation</h3>
            <p className="text-sm text-muted-foreground mt-1">
              GSTR-1 / GSTR-2A reconciliation for {client.business_name}. Use the export tools to generate filing-ready JSON.
            </p>
            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <Stat label="Taxable value" value={fmt(stats.taxable)} />
              <Stat label="GST collected" value={fmt(stats.gst)} />
              <Stat label="Invoices" value={String(stats.total)} />
            </div>
            <Link to="/ca/reports">
              <Button className="mt-5 gap-2"><FileDown className="size-4" /> Open exports</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <ActivityLog client={client} />
        </TabsContent>
      </Tabs>

      <RequestComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        client={client}
      />
    </div>
  );
}

function HealthBadge({ h }: { h: "green" | "yellow" | "red" }) {
  if (h === "green")
    return <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="size-3.5" /> Healthy</Badge>;
  if (h === "yellow")
    return <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><Clock className="size-3.5" /> Attention</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-0 gap-1"><AlertTriangle className="size-3.5" /> Critical</Badge>;
}

function KV({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-2xl font-display font-semibold mt-2">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}

function ClientVaultSummary({ clientId, invCount }: { clientId: string; invCount: number }) {
  const treeFn = useServerFn(getVaultFolderTree);
  const { data: folder, isLoading } = useQuery({
    queryKey: ["vault", "tree", clientId],
    queryFn: () => treeFn({ data: { clientId } }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <FolderArchive className="size-5 text-primary" />
              <h3 className="font-display font-semibold text-lg">Document Vault</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Permanent storage for KYC, GST filings, ITRs, audit reports, bank statements, and more.
            </p>
            {isLoading ? (
              <div className="text-sm text-muted-foreground mt-3">Loading…</div>
            ) : (
              <div className="text-sm mt-3">
                <span className="font-medium">{folder?.total ?? 0} documents</span>
                <span className="text-muted-foreground"> · {formatBytes(folder?.totalBytes ?? 0)} stored</span>
              </div>
            )}
          </div>
          <Link to="/ca/clients/$clientId/documents" params={{ clientId }}>
            <Button><ExternalLink className="size-4 mr-2" />Open Document Vault</Button>
          </Link>
        </div>
        {!isLoading && folder && folder.total > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {VAULT_CATEGORIES.filter((c) => (folder.counts?.[c.value] ?? 0) > 0).map((c) => (
              <Badge key={c.value} variant="outline">{c.label}: {folder.counts[c.value]}</Badge>
            ))}
          </div>
        )}
      </div>
      <DocumentsTable invs={invs} invCount={invCount} />
    </div>
  );
}

function DocumentsTable({ invs, invCount }: { invs: Inv[]; invCount?: number }) {
  const [q, setQ] = useState("");
  const filtered = invs.filter((i) => {
    const s = q.toLowerCase();
    if (!s) return true;
    return (i.vendor_name || "").toLowerCase().includes(s) ||
      (i.invoice_number || "").toLowerCase().includes(s);
  });
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display font-semibold">Invoices ({invCount ?? invs.length})</h3>
        <Input className="max-w-xs" placeholder="Search vendor or invoice #" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground"><FileText className="size-8 mx-auto opacity-40 mb-2" />No invoices uploaded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Invoice #</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Vendor</th>
                <th className="p-3 font-medium text-right">Taxable</th>
                <th className="p-3 font-medium text-right">GST</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const gst = Number(i.cgst || 0) + Number(i.sgst || 0) + Number(i.igst || 0) + Number(i.cess || 0);
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="p-3 font-medium">{i.invoice_number || "—"}</td>
                    <td className="p-3">{i.invoice_date || "—"}</td>
                    <td className="p-3">{i.vendor_name || "—"}</td>
                    <td className="p-3 text-right">{fmt(Number(i.taxable_value || 0))}</td>
                    <td className="p-3 text-right">{fmt(gst)}</td>
                    <td className="p-3 text-right font-medium">{fmt(Number(i.total_amount || 0))}</td>
                    <td className="p-3"><Badge variant={i.status === "validated" ? "default" : "secondary"}>{i.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequestsPanel({
  clientId, client, onCompose,
}: { clientId: string; client: Client; onCompose: () => void }) {
  const [reqs, setReqs] = useState<DocReq[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("document_requests")
      .select("id,doc_type,period_label,note,due_date,status,created_at,fulfilled_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setReqs((data as DocReq[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`req-ca-${clientId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "document_requests", filter: `client_id=eq.${clientId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const markComplete = async (id: string) => {
    const req = reqs.find((r) => r.id === id);
    const { error } = await supabase
      .from("document_requests")
      .update({ status: "complete", fulfilled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Marked as complete");
      const { data: c } = await supabase.from("clients").select("ca_firm_id").eq("id", clientId).single();
      if (c?.ca_firm_id) {
        await logActivity({
          ca_firm_id: c.ca_firm_id,
          client_id: clientId,
          action: "document_request_fulfilled",
          entity_type: "document_request",
          entity_id: id,
          metadata: { doc_type: req?.doc_type, period: req?.period_label },
        });
      }
    }
  };

  const cancel = async (id: string) => {
    const req = reqs.find((r) => r.id === id);
    const { error } = await supabase
      .from("document_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Request cancelled");
      const { data: c } = await supabase.from("clients").select("ca_firm_id").eq("id", clientId).single();
      if (c?.ca_firm_id) {
        await logActivity({
          ca_firm_id: c.ca_firm_id,
          client_id: clientId,
          action: "document_request_cancelled",
          entity_type: "document_request",
          entity_id: id,
          metadata: { doc_type: req?.doc_type, period: req?.period_label },
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" /> Document requests
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ask {client.business_name} for specific documents and track fulfillment.
          </p>
        </div>
        <Button onClick={onCompose} className="gap-2"><Plus className="size-4" /> New request</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />)}</div>
      ) : reqs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No requests yet. Click "New request" to ask for documents.
        </div>
      ) : (
        <div className="space-y-3">
          {reqs.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{DOC_TYPE_LABELS[r.doc_type] || r.doc_type}</span>
                  {r.period_label && <Badge variant="secondary">{r.period_label}</Badge>}
                  <ReqStatus s={r.status} />
                </div>
                {r.note && <div className="text-sm text-muted-foreground mt-1">{r.note}</div>}
                <div className="text-xs text-muted-foreground mt-1.5">
                  Created {new Date(r.created_at).toLocaleDateString()}
                  {r.due_date && ` · Due ${new Date(r.due_date).toLocaleDateString()}`}
                </div>
              </div>
              <div className="flex gap-2">
                {r.status !== "complete" && r.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => markComplete(r.id)}>Mark complete</Button>
                )}
                {r.status !== "cancelled" && r.status !== "complete" && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Cancel</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReqStatus({ s }: { s: string }) {
  if (s === "complete") return <Badge className="bg-emerald-100 text-emerald-700 border-0">Complete</Badge>;
  if (s === "partial") return <Badge className="bg-blue-100 text-blue-700 border-0">Partially fulfilled</Badge>;
  if (s === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-0">Pending</Badge>;
}

function RequestComposer({
  open, onOpenChange, client,
}: { open: boolean; onOpenChange: (v: boolean) => void; client: Client }) {
  const [docType, setDocType] = useState<string>("purchase_bills");
  const [period, setPeriod] = useState<string>(defaultPeriodLabel());
  const [note, setNote] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const createReq = useServerFn(createDocumentRequest);

  const reset = () => {
    setDocType("purchase_bills");
    setPeriod(defaultPeriodLabel());
    setNote("");
    setDueDate("");
    setSentLink(null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: c } = await supabase.from("clients").select("ca_firm_id").eq("id", client.id).single();
      if (!c) throw new Error("Client not found");
      const result = await createReq({
        data: {
          clientId: client.id,
          docType,
          periodLabel: period || null,
          note: note || null,
          dueDate: dueDate || null,
        },
      });
      await logActivity({
        ca_firm_id: c.ca_firm_id,
        client_id: client.id,
        action: "document_request_sent",
        entity_type: "document_request",
        entity_id: result?.id ?? null,
        metadata: { doc_type: docType, period: period || null, due_date: dueDate || null },
      });
      const link = `${window.location.origin}/client/requests`;
      setSentLink(link);
      toast.success("Request sent — client notified");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => { onOpenChange(false); setTimeout(reset, 200); };

  const waText = sentLink
    ? encodeURIComponent(
        `Hi ${client.contact_name || client.business_name}, please upload ${DOC_TYPE_LABELS[docType]}${period ? ` for ${period}` : ""} on GSTify: ${sentLink}`,
      )
    : "";
  const waUrl = client.contact_phone
    ? `https://wa.me/${client.contact_phone.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;
  const mailUrl = sentLink
    ? `mailto:${client.contact_email || ""}?subject=${encodeURIComponent(`Document request: ${DOC_TYPE_LABELS[docType]}`)}&body=${encodeURIComponent(`Please upload ${DOC_TYPE_LABELS[docType]}${period ? ` for ${period}` : ""} here: ${sentLink}${note ? `\n\nNote: ${note}` : ""}`)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(true) : close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request documents from {client.business_name}</DialogTitle>
          <DialogDescription>The client will see this on their dashboard and can upload directly.</DialogDescription>
        </DialogHeader>

        {!sentLink ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Input placeholder="e.g. April 2025" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="e.g. Please upload all April purchase bills above ₹500"
                value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due date (optional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Sending…" : "Send request"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
              Request sent. Share the link via WhatsApp or email too:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => { navigator.clipboard.writeText(sentLink); toast.success("Link copied"); }}>
                <Copy className="size-4" /> Copy link
              </Button>
              <a href={waUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2"><MessageCircle className="size-4" /> WhatsApp</Button>
              </a>
              <a href={mailUrl}>
                <Button variant="outline" className="gap-2"><Mail className="size-4" /> Email</Button>
              </a>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function defaultPeriodLabel() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleString("en", { month: "long", year: "numeric" });
}

const ACTION_META: Record<string, { label: (m: any) => string; icon: React.ReactNode; tint: string }> = {
  document_uploaded: {
    label: (m) => `Uploaded ${m?.file_name ?? "a document"}`,
    icon: <FileText className="size-4" />,
    tint: "bg-blue-500/10 text-blue-600",
  },
  document_edited: {
    label: (m) => `Edited invoice ${m?.invoice_number ?? ""}${m?.fields?.length ? ` (${m.fields.length} field${m.fields.length > 1 ? "s" : ""})` : ""}`.trim(),
    icon: <FileText className="size-4" />,
    tint: "bg-amber-500/10 text-amber-600",
  },
  invoice_approved: {
    label: (m) => `Approved invoice ${m?.invoice_number ?? ""}`.trim(),
    icon: <CheckCircle2 className="size-4" />,
    tint: "bg-emerald-500/10 text-emerald-600",
  },
  report_exported: {
    label: (m) => `Exported ${m?.format ?? "report"}${m?.period ? ` for ${m.period}` : ""}${m?.count ? ` (${m.count} invoices)` : ""}`,
    icon: <FileDown className="size-4" />,
    tint: "bg-violet-500/10 text-violet-600",
  },
  document_request_sent: {
    label: (m) => `Requested ${DOC_TYPE_LABELS[m?.doc_type] ?? "documents"}${m?.period ? ` for ${m.period}` : ""}`,
    icon: <ClipboardList className="size-4" />,
    tint: "bg-indigo-500/10 text-indigo-600",
  },
  document_request_fulfilled: {
    label: (m) => `Marked ${DOC_TYPE_LABELS[m?.doc_type] ?? "document"} request as fulfilled`,
    icon: <CheckCircle2 className="size-4" />,
    tint: "bg-emerald-500/10 text-emerald-600",
  },
  document_request_cancelled: {
    label: (m) => `Cancelled ${DOC_TYPE_LABELS[m?.doc_type] ?? "document"} request`,
    icon: <AlertTriangle className="size-4" />,
    tint: "bg-muted text-muted-foreground",
  },
};

function ActivityLog({ client }: { client: Client }) {
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (mounted) {
        setLogs((data as ActivityLogRow[]) ?? []);
        setLoading(false);
      }
    };
    load();
    const ch = supabase
      .channel(`activity-${client.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `client_id=eq.${client.id}` },
        (payload) => setLogs((prev) => [payload.new as ActivityLogRow, ...prev]),
      )
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [client.id]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.action === filter);

  const filters: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    { id: "document_uploaded", label: "Uploads" },
    { id: "document_edited", label: "Edits" },
    { id: "invoice_approved", label: "Approvals" },
    { id: "report_exported", label: "Exports" },
    { id: "document_request_sent", label: "Requests" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Activity className="size-4 text-primary" /> Activity log
          <span className="text-xs text-muted-foreground font-normal">· {logs.length} events</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                filter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Activity className="size-8 mx-auto opacity-40 mb-2" />
          <div className="text-sm">No activity yet.</div>
        </div>
      ) : (
        <ol className="relative p-4 pl-6">
          <span className="absolute left-[1.85rem] top-4 bottom-4 w-px bg-border" aria-hidden />
          {filtered.map((l) => {
            const meta = ACTION_META[l.action] ?? {
              label: () => l.action.replace(/_/g, " "),
              icon: <Activity className="size-4" />,
              tint: "bg-muted text-muted-foreground",
            };
            const when = new Date(l.created_at);
            return (
              <li key={l.id} className="relative pl-8 py-2.5">
                <span
                  className={`absolute left-0 top-3 size-7 rounded-lg grid place-items-center ring-4 ring-card ${meta.tint}`}
                >
                  {meta.icon}
                </span>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium">{l.actor_name || "Someone"}</span>{" "}
                    <span className="text-muted-foreground">{meta.label(l.metadata)}</span>
                  </div>
                  <time
                    className="text-xs text-muted-foreground tabular-nums"
                    dateTime={l.created_at}
                    title={when.toLocaleString()}
                  >
                    {when.toLocaleString(undefined, {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ============= WhatsApp Panel =============

function WhatsAppPanel({ client }: { client: Client }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const uploadLink = `${origin}/upload?client=${client.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(uploadLink)}`;
  const phoneDigits = (client.contact_phone || "").replace(/\D/g, "");
  const hasPhone = phoneDigits.length >= 8;

  const monthLabel = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("en", { month: "long", year: "numeric" });
  })();

  const templates = [
    {
      id: "welcome",
      icon: <Send className="size-4" />,
      title: "Welcome & upload link",
      body: `Hi ${client.contact_name || client.business_name}, this is your secure GSTify upload link. Send your invoice photos here and your CA will review them automatically:\n\n${uploadLink}`,
    },
    {
      id: "monthly",
      icon: <CalendarClock className="size-4" />,
      title: `Monthly reminder — ${monthLabel}`,
      body: `Hi ${client.contact_name || client.business_name}, friendly reminder to share your ${monthLabel} purchase bills and sales invoices so we can prepare your GST return on time.\n\nUpload here: ${uploadLink}`,
    },
    {
      id: "gst-due",
      icon: <Bell className="size-4" />,
      title: "GST filing due soon",
      body: `Hi ${client.contact_name || client.business_name}, GST filing is due shortly. Please upload any remaining invoices today so we can file on time:\n\n${uploadLink}\n\nThanks!`,
    },
    {
      id: "missing",
      icon: <AlertTriangle className="size-4" />,
      title: "Missing documents",
      body: `Hi ${client.contact_name || client.business_name}, we're missing a few documents to close ${monthLabel}. Please send pending bills via:\n\n${uploadLink}`,
    },
  ];

  const waLink = (text: string) =>
    hasPhone
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display font-semibold flex items-center gap-2">
            <MessageCircle className="size-4 text-emerald-600" /> WhatsApp upload link
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Share this with {client.business_name} — anything they upload lands in this workspace.
          </p>
          <div className="mt-3 flex items-stretch gap-2">
            <Input readOnly value={uploadLink} className="font-mono text-xs" />
            <Button variant="outline" className="gap-2 shrink-0" onClick={() => copy(uploadLink, "Link copied")}>
              <Copy className="size-4" /> Copy
            </Button>
          </div>
          {!hasPhone && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              No phone number on file — add one in client details to send directly. You can still copy messages and send them manually.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display font-semibold">Reminder templates</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Click "Send via WhatsApp" to open chat pre-filled with the message, or copy to paste anywhere.
          </p>
          <div className="mt-4 space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-border p-4 bg-background">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <span className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 grid place-items-center">{t.icon}</span>
                  {t.title}
                </div>
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{t.body}</pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={waLink(t.body)} target="_blank" rel="noreferrer">
                    <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <MessageCircle className="size-3.5" /> Send via WhatsApp
                    </Button>
                  </a>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => copy(t.body, "Message copied")}>
                    <Copy className="size-3.5" /> Copy message
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <h3 className="font-display font-semibold flex items-center justify-center gap-2">
            <QrCode className="size-4 text-primary" /> Scan to upload
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Print or share with the client</p>
          <img
            src={qrUrl}
            alt={`Upload QR code for ${client.business_name}`}
            className="mt-4 mx-auto rounded-xl border border-border bg-white p-2"
            width={220}
            height={220}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => window.open(qrUrl, "_blank")}
          >
            <FileDown className="size-3.5" /> Open / download
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <strong className="text-foreground">Coming soon:</strong> Two-way Twilio / WATI integration — clients message a single WhatsApp number and AI files invoices automatically.
        </div>
      </div>
    </div>
  );
}