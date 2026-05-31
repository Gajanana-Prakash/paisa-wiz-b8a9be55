import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ExternalLink, Loader2, History, Printer, Share2, RefreshCw, FolderInput } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getVaultSignedUrl, getVaultVersions, getVaultDocument, updateVaultDocument, replaceVaultDocument,
} from "@/lib/vault.functions";
import { FileTypeIconView } from "./FileTypeIconView";
import { PdfViewer } from "./PdfViewer";
import { VAULT_CATEGORIES, detectFileType, type VaultCategory } from "./categories";
import { formatBytes } from "./utils";

export function VaultViewerDialog({
  documentId, open, onOpenChange, caFirmId, canEdit = true,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caFirmId?: string;
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const signFn = useServerFn(getVaultSignedUrl);
  const versionsFn = useServerFn(getVaultVersions);
  const docFn = useServerFn(getVaultDocument);
  const updateFn = useServerFn(updateVaultDocument);
  const replaceFn = useServerFn(replaceVaultDocument);

  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ fileName: string; fileType: string } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    setActiveId(documentId);
    setShowVersions(false);
  }, [documentId]);

  const { data: docMeta } = useQuery({
    queryKey: ["vault-doc", activeId],
    queryFn: () => docFn({ data: { id: activeId! } }),
    enabled: !!activeId && open,
  });

  useEffect(() => {
    let cancelled = false;
    if (!activeId || !open) { setUrl(null); return; }
    setUrl(null);
    signFn({ data: { id: activeId, action: "VIEWED" } })
      .then((r) => { if (!cancelled) { setUrl(r.url); setMeta({ fileName: r.fileName, fileType: r.fileType }); } })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [activeId, open, signFn]);

  const { data: versions = [] } = useQuery({
    queryKey: ["vault-versions", documentId],
    queryFn: () => versionsFn({ data: { id: documentId! } }),
    enabled: !!documentId && open,
  });

  const download = async () => {
    if (!activeId) return;
    const r = await signFn({ data: { id: activeId, action: "DOWNLOADED" } });
    window.open(r.url, "_blank");
  };

  const print = () => {
    if (!url) return;
    const w = window.open(url, "_blank");
    w?.addEventListener("load", () => w.print());
  };

  const share = async () => {
    if (!activeId || !docMeta) return;
    const link = `${window.location.origin}/ca/clients/${docMeta.client_id}/documents?doc=${activeId}`;
    await navigator.clipboard.writeText(link);
    toast.success("Document link copied to clipboard");
  };

  const handleReplace = async (file: File) => {
    if (!activeId || !caFirmId || !docMeta) return;
    setReplacing(true);
    try {
      const path = `${caFirmId}/${docMeta.client_id}/vault/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      await replaceFn({
        data: {
          id: activeId,
          newFilePath: path,
          newFileName: file.name,
          newFileSizeBytes: file.size,
          newFileType: detectFileType(file.name, file.type),
        },
      });
      toast.success("New version uploaded");
      qc.invalidateQueries({ queryKey: ["vault"] });
      setActiveId(activeId);
    } catch (e: any) {
      toast.error(e.message ?? "Replace failed");
    } finally {
      setReplacing(false);
    }
  };

  const moveCategory = async (cat: VaultCategory) => {
    if (!activeId) return;
    await updateFn({ data: { id: activeId, category: cat } });
    toast.success("Category updated");
    qc.invalidateQueries({ queryKey: ["vault"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              {meta && <FileTypeIconView type={meta.fileType} className="size-5" />}
              <span className="truncate">{docMeta?.display_name ?? meta?.fileName ?? "Loading…"}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {versions.length > 1 && (
                <Button size="sm" variant="outline" onClick={() => setShowVersions((v) => !v)}>
                  <History className="size-4 mr-1.5" /> {versions.length} versions
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={download}><Download className="size-4 mr-1.5" /> Download</Button>
              {meta?.fileType === "PDF" && (
                <Button size="sm" variant="outline" onClick={print}><Printer className="size-4 mr-1.5" /> Print</Button>
              )}
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" onClick={share}><Share2 className="size-4 mr-1.5" /> Share</Button>
                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline" asChild disabled={replacing}>
                      <span><RefreshCw className={`size-4 mr-1.5 ${replacing ? "animate-spin" : ""}`} /> Replace</span>
                    </Button>
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplace(f); e.target.value = ""; }} />
                  </label>
                </>
              )}
              {url && <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank")}><ExternalLink className="size-4 mr-1.5" /> Open</Button>}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Preview */}
          <div className="flex-1 bg-muted/30 min-h-0 overflow-hidden">
            {!url && <div className="grid place-items-center h-full"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
            {url && meta?.fileType === "PDF" && <PdfViewer url={url} />}
            {url && meta?.fileType === "IMAGE" && (
              <div className="h-full grid place-items-center p-4">
                <img src={url} alt={meta.fileName} className="max-w-full max-h-full object-contain" />
              </div>
            )}
            {url && meta && !["PDF", "IMAGE"].includes(meta.fileType) && (
              <div className="grid place-items-center h-full">
                <div className="text-center p-8">
                  <FileTypeIconView type={meta.fileType} className="size-16 mx-auto" />
                  <div className="mt-3 text-sm text-muted-foreground">Preview not supported. Use Download to view.</div>
                </div>
              </div>
            )}
          </div>

          {/* Metadata panel */}
          <div className="w-72 border-l border-border overflow-y-auto shrink-0 bg-card">
            {docMeta && (
              <div className="p-4 space-y-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Details</div>
                  <dl className="space-y-2">
                    <div><dt className="text-xs text-muted-foreground">Category</dt>
                      {canEdit ? (
                        <Select value={docMeta.document_category} onValueChange={(v) => moveCategory(v as VaultCategory)}>
                          <SelectTrigger className="h-8 mt-0.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VAULT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <dd className="font-medium">{docMeta.document_category}</dd>
                      )}
                    </div>
                    {docMeta.document_subcategory && (
                      <div><dt className="text-xs text-muted-foreground">Type</dt><dd>{docMeta.document_subcategory}</dd></div>
                    )}
                    {docMeta.financial_year && (
                      <div><dt className="text-xs text-muted-foreground">Financial year</dt><dd>{docMeta.financial_year}</dd></div>
                    )}
                    {docMeta.period && (
                      <div><dt className="text-xs text-muted-foreground">Period</dt><dd>{docMeta.period}</dd></div>
                    )}
                    <div><dt className="text-xs text-muted-foreground">Size</dt><dd>{formatBytes(Number(docMeta.file_size_bytes ?? 0))}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Uploaded by</dt><dd>{docMeta.uploader_name}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Uploaded</dt><dd>{format(new Date(docMeta.created_at), "dd MMM yyyy HH:mm")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Access</dt>
                      <dd><Badge variant="outline" className="text-[10px]">{docMeta.access_level.replace(/_/g, " ")}</Badge></dd>
                    </div>
                    {docMeta.tags?.length > 0 && (
                      <div><dt className="text-xs text-muted-foreground">Tags</dt>
                        <dd className="flex flex-wrap gap-1 mt-1">
                          {docMeta.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                        </dd>
                      </div>
                    )}
                    {docMeta.description && (
                      <div><dt className="text-xs text-muted-foreground">Notes</dt><dd className="text-muted-foreground">{docMeta.description}</dd></div>
                    )}
                  </dl>
                </div>

                {showVersions && versions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                      <FolderInput className="size-3" /> Version history
                    </div>
                    <div className="space-y-1">
                      {versions.map((v: any) => (
                        <button
                          key={v.id}
                          onClick={() => setActiveId(v.id)}
                          className={`w-full text-left p-2 rounded-md border text-xs ${activeId === v.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">v{v.version_number}</span>
                            {v.is_latest_version && <Badge variant="outline" className="text-[10px]">Latest</Badge>}
                          </div>
                          <div className="text-muted-foreground mt-0.5">{format(new Date(v.created_at), "dd MMM yyyy")}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
