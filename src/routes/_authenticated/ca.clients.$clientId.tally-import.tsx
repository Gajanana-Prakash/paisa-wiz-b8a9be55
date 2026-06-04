import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  uploadTallyFile, parseTallyImport, getSuggestedMappings, saveMappings,
  previewImport, runImport, listImports, getImportDownloadUrl,
} from "@/lib/tally.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/tally-import")({
  component: TallyImportPage,
});

type Step = 1 | 2 | 3 | 4 | 5;
type ImportType = "SALES_LEDGER" | "PURCHASE_LEDGER" | "GSTR1_DATA" | "GSTR2_DATA" | "FULL_BACKUP";

const TYPE_LABELS: Record<ImportType, string> = {
  SALES_LEDGER: "Sales Ledger Export (GSTR-1 data)",
  PURCHASE_LEDGER: "Purchase Ledger Export (GSTR-2 data)",
  GSTR1_DATA: "GSTR-1 XML (directly from Tally GST module)",
  GSTR2_DATA: "GSTR-2 XML (directly from Tally GST module)",
  FULL_BACKUP: "Full Data Export (all vouchers)",
};

const INSTRUCTIONS = [
  "TallyPrime: Gateway of Tally → Reports → GST Reports → GSTR-1 → Export",
  "Tally ERP 9: Gateway of Tally → Display → Statutory Reports → GST → Export",
  "Choose format: XML or Excel",
  "Select the period (current quarter / month)",
  "Click Export — then drop the file below",
];

function TallyImportPage() {
  const { clientId } = Route.useParams();
  const [tab, setTab] = useState<"wizard" | "history">("wizard");

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/ca/clients/$clientId" params={{ clientId }}><Button size="icon" variant="ghost"><ArrowLeft /></Button></Link>
          <div>
            <h1 className="text-2xl font-display font-semibold">Import from Tally</h1>
            <p className="text-sm text-muted-foreground">Sales / Purchase / GSTR data — additive, won't replace Tally.</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList><TabsTrigger value="wizard">New Import</TabsTrigger><TabsTrigger value="history">Import History</TabsTrigger></TabsList>
        <TabsContent value="wizard" className="mt-4"><Wizard clientId={clientId} /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTable clientId={clientId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = ["Type", "Upload", "Map Ledgers", "Preview", "Import"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {items.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n; const active = step === n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`size-7 rounded-full grid place-content-center text-xs font-medium ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="size-4" /> : n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {i < items.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Wizard({ clientId }: { clientId: string }) {
  const [step, setStep] = useState<Step>(1);
  const [importType, setImportType] = useState<ImportType>("SALES_LEDGER");
  const [importId, setImportId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dupStrategy, setDupStrategy] = useState<"SKIP" | "OVERWRITE" | "ALLOW">("SKIP");
  const [persistMappings, setPersistMappings] = useState(true);

  const upload = useServerFn(uploadTallyFile);
  const parseFn = useServerFn(parseTallyImport);
  const suggestFn = useServerFn(getSuggestedMappings);
  const saveFn = useServerFn(saveMappings);
  const previewFn = useServerFn(previewImport);
  const runFn = useServerFn(runImport);

  const onFile = useCallback(async (file: File) => {
    setParsing(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      const { importId: id } = await upload({ data: { clientId, importType, fileName: file.name, fileBase64: b64 } });
      setImportId(id);
      const p = await parseFn({ data: { importId: id } });
      setParseResult(p);
      const s = await suggestFn({ data: { importId: id } });
      setSuggestions(s.suggestions);
      setStep(3);
      toast.success(`Parsed ${p.total} records`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setParsing(false); }
  }, [clientId, importType, upload, parseFn, suggestFn]);

  const goPreview = async () => {
    if (!importId) return;
    await saveFn({ data: { importId, mappings: suggestions.map((s) => ({ ledger: s.ledger, category: s.category, rate: s.rate, hsn: s.hsn ?? null })), persistForFuture: persistMappings } });
    const p = await previewFn({ data: { importId } });
    setPreview(p);
    setStep(4);
  };

  const startImport = async () => {
    if (!importId) return;
    setRunning(true); setStep(5);
    try {
      const r = await runFn({ data: { importId, duplicateStrategy: dupStrategy } });
      setResult(r);
      toast.success(`Imported ${r.imported}, failed ${r.failed}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && (
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="font-display font-semibold">Step 1 — Select Import Type</h2>
          <RadioGroup value={importType} onValueChange={(v) => setImportType(v as ImportType)} className="grid gap-3">
            {(Object.entries(TYPE_LABELS) as [ImportType, string][]).map(([k, v]) => (
              <label key={k} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value={k} id={k} />
                <span>{v}</span>
              </label>
            ))}
          </RadioGroup>
          <Button onClick={() => setStep(2)}>Next →</Button>
        </div>
      )}

      {step === 2 && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl border border-dashed p-10 text-center space-y-3">
            <Upload className="size-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Drop your Tally export file here</p>
            <p className="text-xs text-muted-foreground">Supports .xml, .xlsx, .xls, .csv, .json</p>
            <Input type="file" accept=".xml,.xlsx,.xls,.csv,.json" disabled={parsing}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            {parsing && <p className="text-sm flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Uploading & parsing…</p>}
          </div>
          <aside className="rounded-2xl border p-4 bg-muted/20">
            <h3 className="font-medium mb-2 text-sm">How to export from Tally</h3>
            <ol className="text-xs space-y-1.5 list-decimal pl-4 text-muted-foreground">
              {INSTRUCTIONS.map((i) => <li key={i}>{i}</li>)}
            </ol>
          </aside>
        </div>
      )}

      {step === 3 && parseResult && (
        <div className="rounded-2xl border p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display font-semibold">Step 3 — Confirm Ledger Mapping</h2>
              <p className="text-sm text-muted-foreground">
                Detected version: <span className="font-medium">{parseResult.version}</span> · Period: {parseResult.periodFrom ?? "?"} → {parseResult.periodTo ?? "?"} · {parseResult.total} records · {suggestions.length} unique ledgers
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={persistMappings} onChange={(e) => setPersistMappings(e.target.checked)} /> Save mappings for future imports</label>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="px-3 py-2">Tally Ledger Name</th><th className="px-3 py-2">GST Category</th><th className="px-3 py-2">Rate (%)</th><th className="px-3 py-2">HSN Code</th><th className="px-3 py-2">Source</th></tr>
              </thead>
              <tbody>
                {suggestions.map((s, idx) => (
                  <tr key={s.ledger} className="border-t">
                    <td className="px-3 py-2 font-medium">{s.ledger}</td>
                    <td className="px-3 py-2">
                      <Select value={s.category} onValueChange={(v) => setSuggestions((arr) => arr.map((x, i) => i === idx ? { ...x, category: v } : x))}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{["SALES","PURCHASE","EXPENSE","ASSET"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2"><Input className="h-8 w-20" type="number" value={s.rate} onChange={(e) => setSuggestions((arr) => arr.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) } : x))} /></td>
                    <td className="px-3 py-2"><Input className="h-8 w-32" value={s.hsn ?? ""} onChange={(e) => setSuggestions((arr) => arr.map((x, i) => i === idx ? { ...x, hsn: e.target.value || null } : x))} /></td>
                    <td className="px-3 py-2"><span className={`text-xs italic ${s.source === "ai" || s.source === "heuristic" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>{s.source === "history" ? "Saved" : s.source === "ai" ? "AI suggestion" : "Auto-detected"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={goPreview}>Confirm All & Proceed →</Button></div>
        </div>
      )}

      {step === 4 && preview && (
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="font-display font-semibold">Step 4 — Preview</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1">{preview.ready} ready</span>
            <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-500 px-3 py-1">{preview.warnings} warnings</span>
            <span className="rounded-full bg-destructive/10 text-destructive px-3 py-1">{preview.errors} errors</span>
            <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 px-3 py-1">{preview.duplicates} duplicates</span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {preview.sample.map((r: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{r.date}</td><td className="px-3 py-2">{r.voucherNo ?? "—"}</td><td className="px-3 py-2">{r.party ?? "—"}</td><td className="px-3 py-2">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2">
                      {r.status === "READY" && <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" />Ready</span>}
                      {r.status === "WARNING" && <span className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="size-3.5" />{r.reason}</span>}
                      {r.status === "ERROR" && <span className="text-destructive inline-flex items-center gap-1"><XCircle className="size-3.5" />{r.reason}</span>}
                      {r.status === "DUPLICATE" && <span className="text-blue-600 inline-flex items-center gap-1"><AlertTriangle className="size-3.5" />Duplicate</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm">Duplicates:</Label>
            <Select value={dupStrategy} onValueChange={(v) => setDupStrategy(v as any)}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="SKIP">Skip duplicates</SelectItem><SelectItem value="OVERWRITE">Overwrite</SelectItem><SelectItem value="ALLOW">Allow all</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setStep(3)}>Back</Button><Button onClick={startImport}>Import {preview.ready + preview.warnings} Records →</Button></div>
        </div>
      )}

      {step === 5 && (
        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="font-display font-semibold">Step 5 — Import Progress</h2>
          {running && (
            <div className="space-y-2">
              <Progress value={50} />
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Importing records…</p>
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-3 py-1">{result.imported} imported</span>
                {result.failed > 0 && <span className="rounded-full bg-destructive/10 text-destructive px-3 py-1">{result.failed} failed</span>}
                <span className="rounded-full bg-muted px-3 py-1">{result.status}</span>
              </div>
              <p className="text-sm">Import complete. You can review records in the client workspace.</p>
              <div className="flex gap-2">
                <Link to="/ca/clients/$clientId" params={{ clientId }}><Button variant="outline">Back to client</Button></Link>
                <Button onClick={() => { setStep(1); setImportId(null); setParseResult(null); setSuggestions([]); setPreview(null); setResult(null); }}>New Import</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryTable({ clientId }: { clientId: string }) {
  const load = useServerFn(listImports);
  const dl = useServerFn(getImportDownloadUrl);
  const { data, isLoading } = useQuery({ queryKey: ["tally-imports", clientId], queryFn: () => load({ data: { clientId } }) });
  const imports = ((data as any)?.imports ?? []) as any[];
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!imports.length) return <p className="text-sm text-muted-foreground">No imports yet.</p>;

  const download = async (id: string) => {
    const { url } = await dl({ data: { importId: id } });
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Records</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Version</th><th className="px-3 py-2" /></tr>
        </thead>
        <tbody>
          {imports.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="px-3 py-2">{new Date(i.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2">{i.import_type}</td>
              <td className="px-3 py-2">{i.period_from ?? "?"} → {i.period_to ?? "?"}</td>
              <td className="px-3 py-2">{i.imported_records} / {i.total_records}{i.failed_records ? ` (${i.failed_records} failed)` : ""}</td>
              <td className="px-3 py-2"><StatusBadge s={i.import_status} /></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{i.tally_version}</td>
              <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => download(i.id)}><Download className="size-3.5 mr-1" />File</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    COMPLETED: "bg-emerald-500/10 text-emerald-700",
    PARTIAL: "bg-amber-500/10 text-amber-700",
    FAILED: "bg-destructive/10 text-destructive",
    PROCESSING: "bg-blue-500/10 text-blue-700",
    UPLOADED: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[s] ?? "bg-muted"}`}>{s}</span>;
}
