import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { searchVaultGlobal } from "@/lib/vault.functions";
import { FileTypeIconView } from "./FileTypeIconView";
import { useTenant } from "@/hooks/useTenant";

export function VaultGlobalSearch() {
  const { role } = useTenant();
  const navigate = useNavigate();
  const searchFn = useServerFn(searchVaultGlobal);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const isCA = role === "ca_owner" || role === "ca_staff";

  useEffect(() => {
    if (!isCA) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCA]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["vault-global-search", query],
    queryFn: () => searchFn({ data: { query } }),
    enabled: open && query.trim().length >= 2,
  });

  if (!isCA) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search all client documents… (Ctrl+K)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search across all clients
          </div>
        )}
        {query.trim().length >= 2 && !isFetching && results.length === 0 && (
          <CommandEmpty>No documents found.</CommandEmpty>
        )}
        {results.length > 0 && (
          <CommandGroup heading="Documents">
            {results.map((r: any) => (
              <CommandItem
                key={r.id}
                value={r.id}
                onSelect={() => {
                  setOpen(false);
                  setQuery("");
                  navigate({
                    to: "/ca/clients/$clientId/documents",
                    params: { clientId: r.client_id },
                    search: { doc: r.id },
                  });
                }}
              >
                <FileTypeIconView type={r.file_type} className="size-4 mr-2" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{r.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.clients?.business_name} · {r.document_category}
                    {r.financial_year ? ` · ${r.financial_year}` : ""}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground ml-2 shrink-0">
                  {format(new Date(r.created_at), "dd MMM")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
