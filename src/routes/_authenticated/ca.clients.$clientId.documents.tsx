import { createFileRoute, useParams, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search, Upload, LayoutGrid, List as ListIcon, Trash2, Eye, Download, Loader2, ArrowLeft,
  Filter, Pencil, Share2, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listVaultDocuments, getVaultFolderTree, deleteVaultDocument, bulkMoveVaultDocuments,
  bulkSetAccessLevel, getVaultSignedUrl, bulkGetVaultSignedUrls, getVaultUploaders, updateVaultDocument,
} from "@/lib/vault.functions";
import { VAULT_CATEGORIES, STORAGE_LIMIT_BYTES, type VaultCategory } from "@/components/vault/categories";
import { VaultFolderTree, type FolderSelection } from "@/components/vault/VaultFolderTree";
import { ImageThumbnail } from "@/components/vault/ImageThumbnail";
import { VaultUploadDialog } from "@/components/vault/VaultUploadDialog";
import { VaultViewerDialog } from "@/components/vault/VaultViewerDialog";
import { downloadDocumentsAsZip } from "@/components/vault/downloadZip";
import { formatBytes } from "@/components/vault/utils";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type VaultSearch = { doc?: string };

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/documents")({
  validateSearch: (s: Record<string, unknown>): VaultSearch => ({
    doc: typeof s.doc === "string" ? s.doc : undefined,
  }),
  component: ClientVaultPage,
});

function ClientVaultPage() {
  const { clientId } = useParams({ from: "/_authenticated/ca/clients/$clientId/documents" });
  const search = useSearch({ from: "/_authenticated/ca/clients/$clientId/documents" });
  const { firm } = useTenant();
  const qc = useQueryClient();
  const list = useServerFn(listVaultDocuments);
  const tree = useServerFn(getVaultFolderTree);
  const del = useServerFn(deleteVaultDocument);
  const move = useServerFn(bulkMoveVaultDocuments);
  const setAccess = useServerFn(bulkSetAccessLevel);
  const sign = useServerFn(getVaultSignedUrl);
  const bulkSign = useServerFn(bulkGetVaultSignedUrls);
  const uploadersFn = useServerFn(getVaultUploaders);
  const update = useServerFn(updateVaultDocument);

  const [folderSel, setFolderSel] = useState<FolderSelection>({ category: "" });
  const [searchText, setSearchText] = useState("");
  const [fileType, setFileType] = useState<string>("");
  const [uploadedBy, setUploadedBy] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renameDoc, setRenameDoc] = useState<any | null>(null);
  const [renameName, setRenameName] = useState("");
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    if (search.doc) setViewerId(search.doc);
  }, [search.doc]);

  const { data: folder } = useQuery({
    queryKey: ["vault", "tree", clientId],
    queryFn: () => tree({ data: { clientId } }),
  });

  const { data: uploaders = [] } = useQuery({
    queryKey: ["vault", "uploaders", clientId],
    queryFn: () => uploadersFn({ data: { clientId } }),
  });

  const filterKey = useMemo(() => [
    folderSel.category, folderSel.subcategory, folderSel.financialYear,
    searchText, fileType, uploadedBy, dateFrom, dateTo,
  ], [folderSel, searchText, fileType, uploadedBy, dateFrom, dateTo]);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["vault", "list", clientId, ...filterKey],
    queryFn: () => list({
      data: {
        clientId,
        category: folderSel.category || undefined,
        subcategory: folderSel.subcategory,
        financialYear: folderSel.financialYear,
        search: searchText || undefined,
        fileType: (fileType || undefined) as any,
        uploadedBy: uploadedBy || undefined,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59Z` : undefined,
      },
    }),
  });

  const storagePct = Math.min(100, ((folder?.totalBytes ?? 0) / STORAGE_LIMIT_BYTES) * 100);

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

  const handleBulkAccess = async (level: "CA_ONLY" | "CA_AND_CLIENT" | "CLIENT_ONLY") => {
    if (!selected.size) return;
    await setAccess({ data: { ids: Array.from(selected), accessLevel: level } });
    toast.success(`Updated access for ${selected.size} documents`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["vault"] });
  };

  const handleBulkZip = async () => {
    if (!selected.size) return;
    setZipBusy(true);
    try {
      const urls = await bulkSign({ data: { ids: Array.from(selected) } });
      await downloadDocumentsAsZip(urls, `documents-${clientId.slice(0, 8)}`);
      toast.success(`Downloaded ${urls.length} files as ZIP`);
    } catch (e: any) {
      toast.error(e.message ?? "ZIP download failed");
    } finally {
      setZipBusy(false);
    }
  };

  const handleDownload = async (id: string) => {
    const r = await sign({ data: { id, action: "DOWNLOADED" } });
    window.open(r.url, "_blank");
  };

  const handleShare = async (id: string) => {
    const link = `${window.location.origin}/ca/clients/${clientId}/documents?doc=${id}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  };

  const handleRename = async () => {
    if (!renameDoc || !renameName.trim()) return;
    await update({ data: { id: renameDoc.id, displayName: renameName.trim() } });
    toast.success("Renamed");
    setRenameDoc(null);
    qc.invalidateQueries({ queryKey: ["vault"] });
  };

  if (!firm) return <div className="p-8"><Loader2 className="size-5 animate-spin" /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="w-64 border-r border-border bg-card overflow-y-auto shrink-0">
        <div className="p-4">
          <Link to="/ca/clients/$clientId" params={{ clientId }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3 mr-1" /> Back to client
          </Link>
          <h2 className="font-display text-lg font-semibold mt-2">Document Vault</h2>
          <div className="text-xs text-muted-foreground mt-1">
            {folder?.total ?? 0} files · {formatBytes(folder?.totalBytes ?? 0)}
          </div>
          <Progress value={storagePct} className="mt-2 h-1" />
          <div className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(folder?.totalBytes ?? 0)} used</div>
        </div>
        <VaultFolderTree folder={folder} selection={folderSel} onSelect={setFolderSel} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border px-6 py-3 flex items-center gap-3 bg-background flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search documents…" className="pl-9" />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Filter className="size-4 mr-1.5" />Filters</Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div>
                <Label className="text-xs">File type</Label>
                <Select value={fileType || "all"} onValueChange={(v) => setFileType(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {["PDF", "IMAGE", "EXCEL", "WORD", "OTHER"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Uploaded by</Label>
                <Select value={uploadedBy || "all"} onValueChange={(v) => setUploadedBy(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Anyone</SelectItem>
                    {uploaders.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 mt-1" />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
            <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")} className="size-8 p-0"><LayoutGrid className="size-4" /></Button>
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} className="size-8 p-0"><ListIcon className="size-4" /></Button>
          </div>
          <Button onClick={() => setUploadOpen(true)}><Upload className="size-4 mr-2" />Upload Documents</Button>
        </div>

        {selected.size > 0 && (
          <div className="border-b border-border px-6 py-2 bg-primary/5 flex items-center gap-3 flex-wrap">
            <div className="text-sm font-medium">{selected.size} selected</div>
            <Select onValueChange={(v) => handleBulkMove(v as VaultCategory)}>
              <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Move to category…" /></SelectTrigger>
              <SelectContent>
                {VAULT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => handleBulkAccess(v as any)}>
              <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Set access…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CA_ONLY">CA only</SelectItem>
                <SelectItem value="CA_AND_CLIENT">Shared with client</SelectItem>
                <SelectItem value="CLIENT_ONLY">Client only</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleBulkZip} disabled={zipBusy}>
              {zipBusy ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4 mr-1" />}
              Download ZIP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

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
                  <div className="aspect-square grid place-items-center bg-muted/40 rounded-md overflow-hidden">
                    <ImageThumbnail documentId={d.id} fileType={d.file_type} className="size-full max-h-full" />
                  </div>
                  <div className="mt-2 text-sm font-medium truncate" title={d.display_name}>{d.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.financial_year || d.document_subcategory || format(new Date(d.created_at), "dd MMM yyyy")}
                  </div>
                  <div className="absolute inset-x-2 bottom-2 opacity-0 group-hover:opacity-100 transition flex gap-1 bg-background/95 backdrop-blur p-1 rounded-md border border-border">
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); setViewerId(d.id); }}><Eye className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); handleDownload(d.id); }}><Download className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="flex-1 h-7" onClick={(e) => { e.stopPropagation(); handleShare(d.id); }}><Share2 className="size-3.5" /></Button>
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
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-left">Size</th>
                    <th className="px-3 py-2 text-left">Uploaded by</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d: any, i: number) => (
                    <tr key={d.id} className={`border-t border-border ${i % 2 ? "bg-muted/20" : ""} hover:bg-muted/40 cursor-pointer`} onClick={() => setViewerId(d.id)}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggleSel(d.id)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 max-w-xs">
                          <ImageThumbnail documentId={d.id} fileType={d.file_type} className="size-4" />
                          <span className="truncate">{d.display_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline">{d.document_category}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{d.financial_year ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.period ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatBytes(Number(d.file_size_bytes ?? 0))}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.uploader_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{format(new Date(d.created_at), "dd MMM yyyy")}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => { setRenameDoc(d); setRenameName(d.display_name); }}><Pencil className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(d.id)}><Download className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleShare(d.id)}><Share2 className="size-3.5" /></Button>
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

      <VaultUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} caFirmId={firm.id} clientId={clientId} defaultCategory={folderSel.category || undefined} />
      <VaultViewerDialog documentId={viewerId} open={!!viewerId} onOpenChange={(v) => !v && setViewerId(null)} caFirmId={firm.id} />

      <Dialog open={!!renameDoc} onOpenChange={(v) => !v && setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename document</DialogTitle></DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDoc(null)}>Cancel</Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
