import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoice } from "@/lib/invoices.functions";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Camera, FileText, CheckCircle2, Clock, Bell, Loader2,
  Inbox, ShieldCheck, AlertTriangle, Building2, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { ClientMessagesPanel } from "@/components/communications/ClientMessagesPanel";

type Doc = {
  id: string;
  file_name: string | null;
  status: string | null;
  created_at: string;
  vendor_name: string | null;
  total_amount: number | null;
};

type Req = {
  id: string;
  doc_type: string;
  period_label: string | null;
  note: string | null;
  due_date: string | null;
  status: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_bills: "Purchase Bills",
  sales_invoices: "Sales Invoices",
  bank_statement: "Bank Statement",
  expense_proofs: "Expense Proofs",
  other: "Other Documents",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function statusLabel(s: string | null): { label: string; tone: "warn" | "ok" | "info" } {
  switch (s) {
    case "uploaded":
    case "processing":
      return { label: "Processing", tone: "info" };
    case "review":
      return { label: "Needs review", tone: "warn" };
    case "validated":
    case "approved":
      return { label: "Approved", tone: "ok" };
    default:
      return { label: "Received", tone: "info" };
  }
}

export function ClientPortal() {
  const { firm, activeClient } = useTenant();
  const navigate = useNavigate();
  const extract = useServerFn(extractInvoice);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [reqUploadId, setReqUploadId] = useState<string | null>(null);
  const reqFileRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    if (!activeClient) return;
    const { data } = await supabase
      .from("invoices")
      .select("id,file_name,status,created_at,vendor_name,total_amount")
      .eq("client_id", activeClient.id)
      .order("created_at", { ascending: false })
      .limit(8);
    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  };

  const loadReqs = async () => {
    if (!activeClient) return;
    const { data } = await supabase
      .from("document_requests")
      .select("id,doc_type,period_label,note,due_date,status")
      .eq("client_id", activeClient.id)
      .in("status", ["pending", "partial"])
      .order("created_at", { ascending: false });
    setReqs((data as Req[]) ?? []);
  };

  useEffect(() => {
    loadDocs();
    loadReqs();
    if (!activeClient) return;
    const ch = supabase
      .channel(`client-portal-${activeClient.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `client_id=eq.${activeClient.id}` },
        () => loadDocs())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "document_requests", filter: `client_id=eq.${activeClient.id}` },
        () => loadReqs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id]);

  const handleFiles = async (files: File[], opts?: { requestId?: string }) => {
    if (!files.length) return;
    if (!firm || !activeClient) {
      toast.error("Workspace not ready yet. Please refresh.");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    try {
      for (const file of files) {
        const path = `${firm.id}/${activeClient.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) { toast.error(upErr.message); continue; }
        const { data: ins, error: insErr } = await supabase
          .from("invoices")
          .insert({
            ca_firm_id: firm.id,
            client_id: activeClient.id,
            uploaded_by: u.user.id,
            file_path: path,
            file_name: file.name,
            status: "uploaded",
          })
          .select("id").single();
        if (insErr || !ins) { toast.error(insErr?.message || "Upload failed"); continue; }
        if (opts?.requestId) {
          await supabase.from("document_request_uploads").insert({
            request_id: opts.requestId,
            invoice_id: ins.id,
            uploaded_by: u.user.id,
          });
          await supabase.from("document_requests")
            .update({ status: "partial" })
            .eq("id", opts.requestId)
            .eq("status", "pending");
        }
        const b64 = await fileToBase64(file);
        try {
          await extract({ data: { invoiceId: ins.id, fileBase64: b64, mimeType: file.type || "application/pdf" } });
          toast.success(`Sent ${file.name} to your CA`);
        } catch (e: any) {
          toast.error(`Could not read ${file.name}: ${e.message}`);
        }
      }
      loadDocs();
      loadReqs();
    } finally { setBusy(false); }
  };

  const markRequestDone = async (id: string) => {
    const { error } = await supabase
      .from("document_requests")
      .update({ status: "complete", fulfilled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Marked complete — your CA will be notified"); loadReqs(); }
  };

  const taxStatus = useMemo(() => {
    if (loading) return { label: "Loading…", tone: "info" as const, icon: Clock };
    const review = docs.filter((d) => d.status === "review").length;
    const ready = docs.filter((d) => d.status === "validated" || d.status === "approved").length;
    if (docs.length === 0) return { label: "No bills uploaded yet", tone: "info" as const, icon: Inbox };
    if (review > 0) return { label: `${review} bill${review > 1 ? "s" : ""} need your CA's attention`, tone: "warn" as const, icon: AlertTriangle };
    if (ready === docs.length) return { label: "All clear — your CA is ready to file", tone: "ok" as const, icon: ShieldCheck };
    return { label: "Your CA is reviewing your bills", tone: "info" as const, icon: Clock };
  }, [docs, loading]);

  const notifications = useMemo(() => {
    const recent = docs.slice(0, 3).map((d) => ({
      id: d.id,
      title: `Bill received: ${d.file_name || "document"}`,
      time: new Date(d.created_at).toLocaleString(),
      icon: CheckCircle2,
    }));
    return recent;
  }, [docs]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1100px] mx-auto space-y-6">
      {/* White-label firm header */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 grid place-items-center overflow-hidden shrink-0">
          {firm?.logo_url ? (
            <img src={firm.logo_url} alt={`${firm.name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <Building2 className="size-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="font-display font-semibold truncate">{firm?.name || "Your CA firm"}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Powered by GSTify</div>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-3xl p-6 md:p-8 text-primary-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute -top-16 -right-16 size-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-gold)" }} />
        <div className="relative">
          <Badge className="bg-white/15 text-white border-0 backdrop-blur mb-3 gap-1.5">
            <Building2 className="size-3" /> Your business
          </Badge>
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {activeClient?.business_name || "Welcome"}
          </h1>
          <p className="text-white/75 mt-2 text-sm md:text-base">
            Managed by <span className="font-medium">{firm?.name || "your CA"}</span>
          </p>
        </div>
      </div>

      <ClientMessagesPanel />

      {/* Upload card — front and center */}
      <section className="bg-card border border-border/70 rounded-3xl p-6 md:p-8 shadow-[0_8px_24px_-12px_rgba(16,24,40,0.08)]">
        <h2 className="font-display text-lg font-semibold">Upload bills & invoices</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send your purchase bills, sales invoices, and receipts here. Your CA will handle the rest.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) handleFiles(files);
          }}
          className={`mt-6 border-2 border-dashed rounded-2xl p-10 text-center transition cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-muted/30"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <div className="mx-auto size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Upload className="size-6" />
          </div>
          <div className="mt-4 font-medium">Drop files here or click to browse</div>
          <div className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, Excel — up to 20 MB each</div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,image/*,.xls,.xlsx,.csv"
            className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) handleFiles(f); e.target.value = ""; }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-full gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy ? "Sending…" : "Upload bills & invoices"}
          </Button>
          <Button
            variant="outline"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="rounded-full gap-2 md:hidden"
          >
            <Camera className="size-4" /> Take photo
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) handleFiles(f); e.target.value = ""; }}
          />
          <Button variant="ghost" onClick={() => navigate({ to: "/invoices" })} className="rounded-full">
            See all my bills
          </Button>
        </div>

        {/* Recent uploads */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent uploads</h3>
            {docs.length > 0 && (
              <Link to="/invoices" className="text-xs text-primary hover:underline">View all</Link>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
              No bills uploaded yet. Drop your first one above.
            </div>
          ) : (
            <div className="divide-y divide-border/60 border border-border/60 rounded-2xl overflow-hidden">
              {docs.map((d) => {
                const s = statusLabel(d.status);
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-card">
                    <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                      <FileText className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.file_name || "Document"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {d.vendor_name || "—"} · {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      variant={s.tone === "ok" ? "default" : s.tone === "warn" ? "destructive" : "secondary"}
                      className="rounded-full"
                    >
                      {s.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Pending requests + Tax status */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-card border border-border/70 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-primary" />
            <h3 className="font-display text-base font-semibold">Requests from your CA</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Documents your CA has asked you to upload.</p>
          {reqs.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground py-8 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
              No pending requests. You're all caught up.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {reqs.map((r) => {
                const overdue = r.due_date && new Date(r.due_date) < new Date();
                return (
                  <li key={r.id} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          {DOC_TYPE_LABELS[r.doc_type] || "Documents"}
                          {r.period_label && <Badge variant="secondary" className="font-normal">{r.period_label}</Badge>}
                          {r.status === "partial" && <Badge className="bg-blue-100 text-blue-700 border-0">In progress</Badge>}
                        </div>
                        {r.note && <div className="text-xs text-muted-foreground mt-1">{r.note}</div>}
                        {r.due_date && (
                          <div className={`text-xs mt-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                            Due {new Date(r.due_date).toLocaleDateString()}{overdue ? " · overdue" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="gap-1.5 rounded-full"
                        disabled={busy}
                        onClick={() => { setReqUploadId(r.id); reqFileRef.current?.click(); }}
                      >
                        <Paperclip className="size-3.5" /> Upload
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markRequestDone(r.id)} className="rounded-full">
                        I'm done
                      </Button>
                    </div>
                  </li>
                );
              })}
              <input
                ref={reqFileRef}
                type="file"
                multiple
                accept=".pdf,image/*,.xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = Array.from(e.target.files || []);
                  if (f.length && reqUploadId) handleFiles(f, { requestId: reqUploadId });
                  setReqUploadId(null);
                  e.target.value = "";
                }}
              />
            </ul>
          )}
        </section>

        <section className="bg-card border border-border/70 rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h3 className="font-display text-base font-semibold">Tax status</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">A quick look at where things stand this month.</p>
          <div className={`mt-4 p-5 rounded-2xl flex items-start gap-3 ${
            taxStatus.tone === "ok" ? "bg-success/10 text-success" :
            taxStatus.tone === "warn" ? "bg-warning/15 text-warning" :
            "bg-primary/5 text-primary"
          }`}>
            <taxStatus.icon className="size-5 mt-0.5 shrink-0" />
            <div className="text-sm font-medium leading-snug">{taxStatus.label}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <Stat label="Sent" value={docs.length} />
            <Stat label="In review" value={docs.filter((d) => d.status === "review" || d.status === "uploaded").length} />
            <Stat label="Approved" value={docs.filter((d) => d.status === "validated" || d.status === "approved").length} />
          </div>
        </section>
      </div>

      {/* Notifications */}
      <section className="bg-card border border-border/70 rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h3 className="font-display text-base font-semibold">Notifications</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground py-6 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
            No notifications yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <n.icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.time}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/40 py-3">
      <div className="text-xl font-display font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}