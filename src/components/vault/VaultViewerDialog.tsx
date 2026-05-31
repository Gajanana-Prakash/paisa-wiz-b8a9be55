import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { getVaultSignedUrl, getVaultVersions } from "@/lib/vault.functions";
import { FileTypeIconView } from "./FileTypeIconView";
import { formatBytes } from "./utils";

export function VaultViewerDialog({
  documentId, open, onOpenChange,
}: { documentId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const signFn = useServerFn(getVaultSignedUrl);
  const versionsFn = useServerFn(getVaultVersions);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ fileName: string; fileType: string } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(documentId);
    setShowVersions(false);
  }, [documentId]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              {meta && <FileTypeIconView type={meta.fileType} className="size-5" />}
              <span className="truncate">{meta?.fileName ?? "Loading…"}</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {versions.length > 1 && (
                <Button size="sm" variant="outline" onClick={() => setShowVersions((v) => !v)}>
                  <History className="size-4 mr-1.5" /> {versions.length} versions
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={download}><Download className="size-4 mr-1.5" /> Download</Button>
              {url && <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank")}><ExternalLink className="size-4 mr-1.5" /> Open</Button>}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 bg-muted/30 grid place-items-center min-h-0">
            {!url && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
            {url && meta?.fileType === "PDF" && (
              <iframe src={url} className="w-full h-full" title="PDF preview" />
            )}
            {url && meta?.fileType === "IMAGE" && (
              <img src={url} alt={meta.fileName} className="max-w-full max-h-full object-contain" />
            )}
            {url && meta && !["PDF","IMAGE"].includes(meta.fileType) && (
              <div className="text-center p-8">
                <FileTypeIconView type={meta.fileType} className="size-16 mx-auto" />
                <div className="mt-3 text-sm text-muted-foreground">Preview not supported. Use Download to view.</div>
              </div>
            )}
          </div>
          {showVersions && (
            <div className="w-72 border-l border-border overflow-y-auto">
              <div className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Version history</div>
              <div className="px-2 pb-3 space-y-1">
                {versions.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveId(v.id)}
                    className={`w-full text-left p-2 rounded-md border ${activeId === v.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">v{v.version_number}</div>
                      {v.is_latest_version && <Badge variant="outline" className="text-[10px]">Latest</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(v.created_at), "dd MMM yyyy HH:mm")}</div>
                    <div className="text-xs text-muted-foreground">{formatBytes(Number(v.file_size_bytes ?? 0))}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
