import { useState } from "react";
import { ChevronRight, Folder, FileText } from "lucide-react";
import { VAULT_CATEGORIES, SUBCATEGORIES, type VaultCategory } from "./categories";
import { cn } from "@/lib/utils";

export type FolderSelection = {
  category: VaultCategory | "";
  subcategory?: string;
  financialYear?: string;
};

type TreeData = {
  counts: Record<string, number>;
  byFy: Record<string, Record<string, number>>;
  bySubcategory: Record<string, Record<string, number>>;
  total: number;
};

export function VaultFolderTree({
  folder,
  selection,
  onSelect,
}: {
  folder: TreeData | undefined;
  selection: FolderSelection;
  onSelect: (sel: FolderSelection) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["KYC", "GST", "INCOME_TAX"]));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const isActive = (cat: VaultCategory, sub?: string, fy?: string) =>
    selection.category === cat &&
    (sub === undefined || selection.subcategory === sub) &&
    (fy === undefined || selection.financialYear === fy);

  return (
    <nav className="px-2 pb-4 space-y-0.5">
      <button
        onClick={() => onSelect({ category: "" })}
        className={cn(
          "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between",
          !selection.category ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
        )}
      >
        <span className="flex items-center gap-2"><Folder className="size-4" /> All documents</span>
        <span className="text-xs text-muted-foreground">{folder?.total ?? 0}</span>
      </button>

      {VAULT_CATEGORIES.map((c) => {
        const cat = c.value as VaultCategory;
        const count = folder?.counts?.[cat] ?? 0;
        const hasChildren = cat === "KYC" || cat === "GST" || cat === "INCOME_TAX";
        const isExp = expanded.has(cat);

        return (
          <div key={cat}>
            <button
              onClick={() => {
                if (hasChildren) toggle(cat);
                onSelect({ category: cat });
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group",
                isActive(cat) && !selection.subcategory && !selection.financialYear
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {hasChildren && (
                  <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", isExp && "rotate-90")} />
                )}
                {!hasChildren && <span className="size-3.5" />}
                <span className="truncate">{c.label}</span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0 ml-1">{count}</span>
            </button>

            {cat === "KYC" && isExp && (
              <div className="ml-4 border-l border-border pl-1 space-y-0.5">
                {SUBCATEGORIES.KYC.map((sub) => {
                  const subCount = folder?.bySubcategory?.KYC?.[sub] ?? 0;
                  if (!subCount && sub !== "Other") return null;
                  return (
                    <button
                      key={sub}
                      onClick={() => onSelect({ category: "KYC", subcategory: sub })}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between",
                        isActive("KYC", sub) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground",
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate"><FileText className="size-3" />{sub}</span>
                      <span className="text-[10px]">{subCount}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(cat === "GST" || cat === "INCOME_TAX") && isExp && (
              <div className="ml-4 border-l border-border pl-1 space-y-0.5">
                {Object.entries(folder?.byFy?.[cat] ?? {})
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([fy, fyCount]) => (
                    <button
                      key={fy}
                      onClick={() => onSelect({ category: cat, financialYear: fy })}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between",
                        isActive(cat, undefined, fy) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground",
                      )}
                    >
                      <span className="flex items-center gap-1.5"><Folder className="size-3" />{fy}</span>
                      <span className="text-[10px]">{fyCount}</span>
                    </button>
                  ))}
                {!Object.keys(folder?.byFy?.[cat] ?? {}).length && (
                  <div className="px-2 py-1 text-[10px] text-muted-foreground">No FY folders yet</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
