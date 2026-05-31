import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { extractInvoice } from "@/lib/invoices.functions";
import { useTenant } from "@/hooks/useTenant";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

const DOC_LABELS: Record<string, { en: string; hi: string }> = {
  purchase_bills: { en: "Purchase bills", hi: "खरीद बिल" },
  sales_invoices: { en: "Sales invoices", hi: "बिक्री चालान" },
  bank_statement: { en: "Bank statement", hi: "बैंक स्टेटमेंट" },
  expense_proofs: { en: "Expense proofs", hi: "खर्च प्रमाण" },
  other: { en: "Documents", hi: "दस्तावेज़" },
};

type Req = {
  id: string;
  doc_type: string;
  period_label: string | null;
  note: string | null;
  due_date: string | null;
  status: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ClientRequestsPage() {
  const { firm, activeClient } = useTenant();
  const { t, formatDate, isHindi } = useLanguage();
  const extract = useServerFn(extractInvoice);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeReqId, setActiveReqId] = useState<string | null>(null);

  const docLabel = (type: string) => {
    const row = DOC_LABELS[type];
    if (!row) return type;
    return isHindi ? row.hi : row.en;
  };

  const loadReqs = async () => {
    if (!activeClient) return;
    const { data } = await supabase
      .from("document_requests")
      .select("id,doc_type,period_label,note,due_date,status")
      .eq("client_id", activeClient.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    setReqs((data as Req[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadReqs();
    if (!activeClient) return;
    const ch = supabase
      .channel(`client-reqs-${activeClient.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_requests", filter: `client_id=eq.${activeClient.id}` },
        () => loadReqs(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeClient?.id]);

  const statusBadge = (s: string) => {
    if (s === "complete") return <Badge className="bg-emerald-100 text-emerald-800 border-0">{t("status_approved")}</Badge>;
    if (s === "partial") return <Badge className="bg-blue-100 text-blue-800 border-0">{t("status_partial")}</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 border-0">{t("status_pending_badge")}</Badge>;
  };

  const uploadForRequest = async (files: FileList | null) => {
    if (!files?.length || !firm || !activeClient || !activeReqId) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    try {
      for (const file of Array.from(files)) {
        const path = `${firm.id}/${activeClient.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) { toast.error(t("upload_error")); continue; }
        const { data: ins, error: insErr } = await supabase.from("invoices").insert({
          ca_firm_id: firm.id,
          client_id: activeClient.id,
          uploaded_by: u.user.id,
          file_path: path,
          file_name: file.name,
          status: "uploaded",
        }).select("id").single();
        if (insErr || !ins) continue;
        await supabase.from("document_request_uploads").insert({
          request_id: activeReqId,
          invoice_id: ins.id,
          uploaded_by: u.user.id,
        });
        await supabase.from("document_requests").update({ status: "partial" }).eq("id", activeReqId).eq("status", "pending");
        const b64 = await fileToBase64(file);
        try {
          await extract({ data: { invoiceId: ins.id, fileBase64: b64, mimeType: file.type || "application/pdf" } });
        } catch { /* non-fatal */ }
      }
      toast.success(t("upload_success"));
      loadReqs();
    } finally {
      setBusy(false);
      setActiveReqId(null);
    }
  };

  const markDone = async (id: string) => {
    const { error } = await supabase
      .from("document_requests")
      .update({ status: "complete", fulfilled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("status_submitted"));
      loadReqs();
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="client-portal-root max-w-4xl mx-auto space-y-6 p-4 md:p-0">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Inbox className="size-3.5" /> {t("pending_requests")}
        </div>
        <h1 className="font-display text-3xl font-semibold mt-1">{t("requests_page_title")}</h1>
        <p className="text-muted-foreground mt-1 leading-relaxed">{t("requests_page_sub")}</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => uploadForRequest(e.target.files)}
      />

      {reqs.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed bg-card text-center">
          <Inbox className="size-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground leading-relaxed">{t("no_requests_yet")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reqs.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-lg leading-relaxed">
                    {t("request_title")}: {docLabel(r.doc_type)}
                    {r.period_label ? ` — ${r.period_label}` : ""}
                  </p>
                  {r.note && <p className="text-muted-foreground mt-1">{r.note}</p>}
                  {r.due_date && (
                    <p className="text-sm mt-2">
                      {t("due_by")}: {formatDate(r.due_date)}
                    </p>
                  )}
                </div>
                {statusBadge(r.status)}
              </div>
              {r.status !== "complete" && r.status !== "cancelled" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    className="min-h-11 gap-2"
                    disabled={busy}
                    onClick={() => {
                      setActiveReqId(r.id);
                      fileRef.current?.click();
                    }}
                  >
                    {busy && activeReqId === r.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {t("upload_button")}
                  </Button>
                  <Button size="lg" variant="outline" className="min-h-11" onClick={() => markDone(r.id)}>
                    {t("mark_done")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
