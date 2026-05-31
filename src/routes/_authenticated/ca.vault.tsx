import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, HardDrive, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getVaultStorageOverview, getRecentVaultUploads, searchVaultGlobal } from "@/lib/vault.functions";
import { FileTypeIconView } from "@/components/vault/FileTypeIconView";
import { formatBytes } from "@/components/vault/utils";
import { STORAGE_LIMIT_BYTES } from "@/components/vault/categories";

export const Route = createFileRoute("/_authenticated/ca/vault")({ component: VaultOverviewPage });

function VaultOverviewPage() {
  const overview = useServerFn(getVaultStorageOverview);
  const recent = useServerFn(getRecentVaultUploads);
  const searchFn = useServerFn(searchVaultGlobal);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const { data: ov, isLoading } = useQuery({ queryKey: ["vault", "overview"], queryFn: () => overview({ data: undefined as any }) });
  const { data: recents = [] } = useQuery({ queryKey: ["vault", "recent"], queryFn: () => recent({ data: { limit: 20 } }) });

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchFn({ data: { query: query.trim() } });
      setSearchResults(r);
    } finally {
      setSearching(false);
    }
  };

  if (isLoading || !ov) return <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

  const pct = Math.min(100, (ov.totalBytes / STORAGE_LIMIT_BYTES) * 100);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Document Vault</h1>
        <p className="text-muted-foreground mt-1">All client documents across your firm. Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+K</kbd> for quick search.</p>
      </div>

      <div className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search all client documents…"
            className="pl-9"
          />
        </div>
        <Button onClick={runSearch} disabled={searching || query.trim().length < 2}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="border border-border rounded-xl bg-card">
          <div className="px-5 py-3 border-b border-border font-semibold">Search results ({searchResults.length})</div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {searchResults.map((r: any) => (
              <Link
                key={r.id}
                to="/ca/clients/$clientId/documents"
                params={{ clientId: r.client_id }}
                search={{ doc: r.id }}
                className="p-3 flex items-center gap-3 hover:bg-muted/40"
              >
                <FileTypeIconView type={r.file_type} className="size-5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.clients?.business_name} · {r.document_category}
                    {r.financial_year ? ` · ${r.financial_year}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3">
          <HardDrive className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">Storage usage</div>
              <div className="text-sm text-muted-foreground">{formatBytes(ov.totalBytes)} of {formatBytes(STORAGE_LIMIT_BYTES)}</div>
            </div>
            <Progress value={pct} className="mt-2 h-2" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border rounded-xl bg-card">
          <div className="px-5 py-3 border-b border-border font-semibold">Storage by client</div>
          <div className="divide-y divide-border">
            {ov.byClient.length === 0 && <div className="p-5 text-sm text-muted-foreground">No documents yet.</div>}
            {ov.byClient.slice(0, 10).map((c) => {
              const w = Math.min(100, (c.bytes / Math.max(1, ov.byClient[0].bytes)) * 100);
              return (
                <Link key={c.clientId} to="/ca/clients/$clientId/documents" params={{ clientId: c.clientId }} className="block p-4 hover:bg-muted/30">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-muted-foreground">{formatBytes(c.bytes)} · {c.count} files</span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${w}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border border-border rounded-xl bg-card">
          <div className="px-5 py-3 border-b border-border font-semibold">Recent uploads</div>
          <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
            {recents.length === 0 && <div className="p-5 text-sm text-muted-foreground">Nothing recent.</div>}
            {recents.map((r: any) => (
              <Link
                key={r.id}
                to="/ca/clients/$clientId/documents"
                params={{ clientId: r.client_id }}
                search={{ doc: r.id }}
                className="p-3 flex items-center gap-3 hover:bg-muted/40"
              >
                <FileTypeIconView type={r.file_type} className="size-5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.clients?.business_name} · {r.document_category}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "dd MMM")}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
