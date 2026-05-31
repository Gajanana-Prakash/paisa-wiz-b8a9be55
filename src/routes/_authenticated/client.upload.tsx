import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoice } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { useLanguage } from "@/hooks/useLanguage";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/client/upload")({ component: UploadPage });

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function UploadPage() {
  const navigate = useNavigate();
  const extract = useServerFn(extractInvoice);
  const { firm, activeClient } = useTenant();
  const { t } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (!files.length) return;
    if (!firm || !activeClient) {
      toast.error(t("upload_error"));
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    try {
      let lastId: string | null = null;
      for (const file of files) {
        const path = `${firm.id}/${activeClient.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) { toast.error(t("upload_error")); continue; }
        const { data: ins, error: insErr } = await supabase.from("invoices")
          .insert({
            ca_firm_id: firm.id,
            client_id: activeClient.id,
            uploaded_by: u.user.id,
            file_path: path,
            file_name: file.name,
            status: "uploaded",
          })
          .select("id").single();
        if (insErr || !ins) { toast.error(t("upload_error")); continue; }
        lastId = ins.id;
        await logActivity({
          ca_firm_id: firm.id,
          client_id: activeClient.id,
          action: "document_uploaded",
          entity_type: "invoice",
          entity_id: ins.id,
          metadata: { file_name: file.name, size: file.size },
        });
        const b64 = await fileToBase64(file);
        const mime = file.type || "application/pdf";
        try {
          await extract({ data: { invoiceId: ins.id, fileBase64: b64, mimeType: mime } });
          toast.success(t("upload_success"));
        } catch {
          toast.error(t("upload_error"));
        }
      }
      if (lastId) navigate({ to: "/client/documents" });
    } finally { setBusy(false); }
  };

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles(Array.from(list));
  };

  return (
    <div className="client-portal-root p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{t("upload_page_title")}</h1>
        <p className="text-muted-foreground mt-1 leading-relaxed">{t("upload_page_sub")}</p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-10 md:p-14 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <UploadIcon className="size-12 mx-auto text-primary mb-4" />
        <p className="text-lg font-medium leading-relaxed px-2">{t("upload_drop_hint")}</p>
        <p className="text-sm text-muted-foreground mt-2">{t("upload_file_types")}</p>
        {files.length > 0 && (
          <p className="mt-4 text-sm font-medium">{files.length} file(s) selected</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.xlsx,.xls"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <Button
        size="lg"
        className="w-full min-h-12 text-base"
        disabled={busy || !files.length}
        onClick={upload}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : t("upload_button")}
      </Button>
    </div>
  );
}
