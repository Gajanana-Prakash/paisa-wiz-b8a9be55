import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, LayoutGrid, List as ListIcon, Trash2, FolderInput, Eye, Download, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { listVaultDocuments, getVaultFolderTree, deleteVaultDocument, bulkMoveVaultDocuments, getVaultSignedUrl } from "@/lib/vault.functions";
import { VAULT_CATEGORIES, type VaultCategory } from "@/components/vault/categories";
import { FileTypeIconView } from "@/components/vault/FileTypeIconView";
import { VaultUploadDialog } from "@/components/vault/VaultUploadDialog";
import { VaultViewerDialog } from "@/components/vault/VaultViewerDialog";
import { formatBytes } from "@/components/vault/utils";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/documents")({ component: ClientVaultPage });

function ClientVaultPage() {
  const { clientId } = useParams({ from: "/_authenticated/ca/clients/$clientId/documents" });
  const { firm } = useTenant();
  const qc = useQueryClient();
  const list = useServerFn(listVaultDocuments);
  const tree = useServerFn(getVaultFolderTree);
  const del = useServerFn(deleteVaultDocument);
  const move = useServerFn(bulkMoveVaultDocuments);
  const sign = useServerFn(getVaultSignedUrl);

  const [category, setCategory] = useState<VaultCategory | "">("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: folder } = useQuery({
    queryKey: ["vault", "tree", clientId],
    queryFn: () => tree({ data: { clientId } }),
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["vault", "list", clientId, category, search],
    queryFn: () => list({ data: { clientId, category: category || undefined, search: search || undefined } }),
  });

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string, isKyc: boolean) => {
    if (isKyc && !confirm("This is a KYC document. Delete anyway?")) return;
    await del({ data: { id, confirm: true } });
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["vault"] });
  };

  const handleBulkMove = async (cat: VaultCategory) => {
    if (!selected.size) return;
    await move({ data: { ids: Array.from(selected), category: cat } });
    toast.success(`Moved ${selected.size} to ${cat}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["vault"] });
  };

  const handleDownload = async (id: string) => {
    const r = await sign({ data: { id, action: "DOWNLOADED" } });
    window.open(r.url, "_blank");
  };

  if (!firm) return <div className="p-8"><Loader2 className="size-5 animate-spin" /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left folder tree */}
      <aside className="w-64 border-r border-border bg-card overflow-y-auto">
        <div className="p-4">
          <Link to="/ca/clients/$clientId" params={{ clientId }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3 mr-1" /> Back to client
          </Link>
          <h2 className="font-display text-lg font-semibold mt-2">Documents</h2>
          <div className="text-xs text-muted-foreground mt-1">
            {folder?.total ?? 0} files · {formatBytes(folder?.totalBytes ?? 0)}
          </div>
        </div>
        <nav className="px-2 pb-4 space-y-0.5">
          <button
            onClick={() => setCategory("")}
            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${!category ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
          >
            <span>All documents</span>
            <span className="text-xs text-muted-foreground">{folder?.total ?? 0}</span>
          </button>
          {VAULT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value as VaultCategory)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${category === c.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
            >
              <span>{c.label}</span>
              <span className="text-xs text-muted-foreground">{folder?.counts?.[c.value] ?? 0}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-3 bg-background">
          <div className="relative flex-1 max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="pl-9" />
          </div>
          <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
            <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")} className="size-8 p-0"><LayoutGrid className="size-4" /></Button>
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} className="size-8 p-0"><ListIcon className="size-4" /></Button>
          </div>
          <Button onClick={() => setUploadOpen(true)}><Upload className="size-4 mr-2" />Upload</Button>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="border-b border-border px-6 py-2 bg-primary/5 flex items-center gap-3">
            <div className="text-sm font-medium">{selected.size} selected</div>
            <Select onValueChange={(v) => handleBulkMove(v as VaultCategory)}>
              <SelectTrigger className="w-48 h-8"><SelectValue placeholder="Move to category…" /></SelectTrigger>
              <SelectContent>
                {VAULT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : docs.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-muted-foreground">No documents yet</div>
              <Button onClick={() => setUploadOpen(true)} className="mt-4"><Upload className="size-4 mr-2" />Upload your first document</Button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {docs.map((d: any) => (
                <div key={d.id} className="group relative border border-border rounded-lg p-3 bg-card hover:shadow-md transition cursor-pointer" onClick={() => setViewerId(d.id)}>
                  <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggleSel(d.id)} />
                  </div>
                  <div className="aspect-square grid place-items-center bg-muted/40 rounded-md">
                    <FileTypeIconView type={d.file_type} className="size-12" />
                  </div>
                  <div className="mt-2 text-sm font-medium truncate" title={d.display_name}>{d.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.financial_year || d.document_subcategory || format(new Date(d.created_at), "dd MMM yyyy")}
                  </div>
                  <div className="absolute inset-x-2 bottom-2 opacity-0 group-hover:opacity-100 transition flex gap-1 bg-background/95 backdrop-blur p-1 rounded-md border border-border">
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); setViewerId(d.id); }}><Eye className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); handleDownload(d.id); }}><Download className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); handleDelete(d.id, d.is_kyc_document); }}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">FY</th>
                    <th className="px-3 py-2 text-left">Size</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Access</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d: any, i: number) => (
                    <tr key={d.id} className={`border-t border-border ${i % 2 ? "bg-muted/20" : ""} hover:bg-muted/40 cursor-pointer`} onClick={() => setViewerId(d.id)}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggleSel(d.id)} />
                      </td>
                      <td className="px-3 py-2 flex items-center gap-2">
                        <FileTypeIconView type={d.file_type} className="size-4" />
                        <span className="truncate max-w-xs">{d.display_name}</span>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline">{d.document_category}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{d.financial_year ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatBytes(Number(d.file_size_bytes ?? 0))}</td>
                      <td className="px-3 py-2 text-muted-foreground">{format(new Date(d.created_at), "dd MMM yyyy")}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{d.access_level.replace("_", " ")}</Badge></td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(d.id)}><Download className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id, d.is_kyc_document)}><Trash2 className="size-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <VaultUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} caFirmId={firm.id} clientId={clientId} defaultCategory={category || undefined} />
      <VaultViewerDialog documentId={viewerId} open={!!viewerId} onOpenChange={(v) => !v && setViewerId(null)} />
    </div>
  );
}
