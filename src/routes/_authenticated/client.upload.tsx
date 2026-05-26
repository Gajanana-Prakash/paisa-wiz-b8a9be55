import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoice } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Upload as UploadIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!files.length) return;
    if (!firm || !activeClient) {
      toast.error("Pick an active client from the top bar before uploading");
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
        if (upErr) { toast.error(upErr.message); continue; }
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
        if (insErr || !ins) { toast.error(insErr?.message || "Insert failed"); continue; }
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
          toast.success(`Processed ${file.name}`);
        } catch (e: any) {
          toast.error(`AI failed for ${file.name}: ${e.message}`);
        }
      }
      if (lastId) navigate({ to: "/invoices" });
    } finally { setBusy(false); }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl font-semibold">Upload invoices</h1>
      <p className="text-muted-foreground mt-1">PDFs, images, scans. AI extracts and validates everything.</p>
      <label className="mt-8 block border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 transition bg-card">
        <UploadIcon className="size-10 mx-auto text-muted-foreground" />
        <div className="mt-3 font-medium">Drop files here or click to browse</div>
        <div className="text-sm text-muted-foreground mt-1">PDF, JPG, PNG, WEBP</div>
        <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      </label>
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((f, i) => <div key={i} className="p-3 bg-card border border-border rounded-lg text-sm flex justify-between"><span>{f.name}</span><span className="text-muted-foreground">{(f.size/1024).toFixed(1)} KB</span></div>)}
          <Button onClick={upload} disabled={busy} className="mt-4 w-full">
            {busy ? <><Loader2 className="size-4 mr-2 animate-spin"/>Processing with AI...</> : `Upload & extract ${files.length} file${files.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}