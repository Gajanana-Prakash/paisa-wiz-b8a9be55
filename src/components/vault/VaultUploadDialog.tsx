import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadVaultDocument } from "@/lib/vault.functions";
import { VAULT_CATEGORIES, SUBCATEGORIES, detectFileType, type VaultCategory } from "./categories";

type FileMeta = {
  file: File;
  displayName: string;
  category: VaultCategory;
  subcategory: string;
  financialYear: string;
  period: string;
  description: string;
  tags: string;
  accessLevel: "CA_ONLY" | "CA_AND_CLIENT" | "CLIENT_ONLY";
};

const FY_OPTIONS = ["FY 2025-26", "FY 2024-25", "FY 2023-24", "FY 2022-23", "FY 2021-22"];

export function VaultUploadDialog({
  open, onOpenChange, caFirmId, clientId, defaultCategory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caFirmId: string;
  clientId: string;
  defaultCategory?: VaultCategory;
}) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadVaultDocument);
  const [items, setItems] = useState<FileMeta[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = (files: File[]) => {
    const next = files.map((file) => ({
      file,
      displayName: file.name.replace(/\.[^.]+$/, ""),
      category: defaultCategory ?? ("OTHER" as VaultCategory),
      subcategory: "",
      financialYear: "",
      period: "",
      description: "",
      tags: "",
      accessLevel: "CA_ONLY" as const,
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const update = (idx: number, patch: Partial<FileMeta>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const remove = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      for (const it of items) {
        const path = `${caFirmId}/${clientId}/vault/${crypto.randomUUID()}-${it.file.name}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, it.file);
        if (upErr) { toast.error(`${it.file.name}: ${upErr.message}`); continue; }
        await upload({ data: {
          clientId,
          filePath: path,
          fileName: it.file.name,
          displayName: it.displayName.trim() || it.file.name,
          fileType: detectFileType(it.file.name, it.file.type),
          fileSizeBytes: it.file.size,
          category: it.category,
          subcategory: it.subcategory || null,
          financialYear: it.financialYear || null,
          period: it.period || null,
          description: it.description || null,
          tags: it.tags.split(",").map((s) => s.trim()).filter(Boolean),
          accessLevel: it.accessLevel,
          isKycDocument: it.category === "KYC",
          source: "MANUAL_UPLOAD",
        }});
      }
      toast.success(`Uploaded ${items.length} document${items.length > 1 ? "s" : ""}`);
      setItems([]);
      qc.invalidateQueries({ queryKey: ["vault"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload to vault</DialogTitle>
        </DialogHeader>

        <label
          className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onPick(Array.from(e.dataTransfer.files)); }}
        >
          <Upload className="size-8 mx-auto text-muted-foreground" />
          <div className="mt-2 font-medium">Drop files or click to browse</div>
          <div className="text-xs text-muted-foreground mt-1">PDF, images, Excel, Word — multiple files supported</div>
          <input type="file" multiple className="hidden" onChange={(e) => onPick(Array.from(e.target.files || []))} />
        </label>

        {items.length > 0 && (
          <div className="mt-4 space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm font-medium truncate">{it.file.name}</div>
                  <Button variant="ghost" size="icon" onClick={() => remove(idx)}><X className="size-4" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Display name</Label>
                    <Input value={it.displayName} onChange={(e) => update(idx, { displayName: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={it.category} onValueChange={(v) => update(idx, { category: v as VaultCategory, subcategory: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VAULT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Subcategory</Label>
                    <Select value={it.subcategory} onValueChange={(v) => update(idx, { subcategory: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {SUBCATEGORIES[it.category].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Financial year</Label>
                    <Select value={it.financialYear} onValueChange={(v) => update(idx, { financialYear: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {FY_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Period</Label>
                    <Input placeholder="e.g. Q1, April 2025" value={it.period} onChange={(e) => update(idx, { period: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Tags (comma separated)</Label>
                    <Input value={it.tags} onChange={(e) => update(idx, { tags: e.target.value })} placeholder="urgent, original" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Description (optional)</Label>
                    <Textarea rows={2} value={it.description} onChange={(e) => update(idx, { description: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Visibility</Label>
                    <Select value={it.accessLevel} onValueChange={(v) => update(idx, { accessLevel: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CA_ONLY">CA firm only</SelectItem>
                        <SelectItem value="CA_AND_CLIENT">Shared with client</SelectItem>
                        <SelectItem value="CLIENT_ONLY">Client only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !items.length}>
            {busy ? <><Loader2 className="size-4 mr-2 animate-spin" />Uploading…</> : `Upload ${items.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
