import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { listClientVaultDocuments, getVaultSignedUrl } from "@/lib/vault.functions";
import { VAULT_CATEGORIES, type VaultCategory } from "@/components/vault/categories";
import { FileTypeIconView } from "@/components/vault/FileTypeIconView";
import { VaultViewerDialog } from "@/components/vault/VaultViewerDialog";
import { formatBytes } from "@/components/vault/utils";

export const Route = createFileRoute("/_authenticated/client/documents")({ component: ClientPortalDocs });

function ClientPortalDocs() {
  const { activeClient } = useTenant();
  const list = useServerFn(listClientVaultDocuments);
  const sign = useServerFn(getVaultSignedUrl);
  const [category, setCategory] = useState<VaultCategory | "">("");
  const [viewerId, setViewerId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["client-vault", activeClient?.id, category],
    queryFn: () => list({ data: { clientId: activeClient!.id, category: category || undefined } }),
    enabled: !!activeClient,
  });

  const download = async (id: string) => {
    try {
      const r = await sign({ data: { id, action: "DOWNLOADED" } });
      window.open(r.url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  if (!activeClient) return <div className="p-8 text-muted-foreground">Select a client.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-semibold">My documents</h1>
      <p className="text-muted-foreground mt-1">Documents your CA has shared with you.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" variant={!category ? "default" : "outline"} onClick={() => setCategory("")}>All</Button>
        {VAULT_CATEGORIES.map((c) => (
          <Button key={c.value} size="sm" variant={category === c.value ? "default" : "outline"} onClick={() => setCategory(c.value as VaultCategory)}>
            {c.label}
          </Button>
        ))}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No documents shared yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((d: any) => (
              <div key={d.id} className="border border-border rounded-lg p-4 bg-card flex items-start gap-3">
                <FileTypeIconView type={d.file_type} className="size-8 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.display_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {d.document_category} · {d.financial_year ?? format(new Date(d.created_at), "dd MMM yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatBytes(Number(d.file_size_bytes ?? 0))}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewerId(d.id)}>View</Button>
                    <Button size="sm" variant="ghost" onClick={() => download(d.id)}><Download className="size-3.5 mr-1" />Download</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <VaultViewerDialog documentId={viewerId} open={!!viewerId} onOpenChange={(v) => !v && setViewerId(null)} />
    </div>
  );
}
