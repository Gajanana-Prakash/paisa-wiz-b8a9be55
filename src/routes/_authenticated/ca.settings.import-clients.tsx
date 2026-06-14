import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { commitClientImport } from "@/lib/import-clients.functions";

export const Route = createFileRoute("/_authenticated/ca/settings/import-clients")({
  component: ImportClientsPage,
});

type Row = Record<string, string>;
const FIELDS = [
  { key: "business_name", label: "Business name *", required: true },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "contact_name", label: "Contact name" },
  { key: "contact_email", label: "Contact email" },
  { key: "contact_phone", label: "Contact phone" },
] as const;

const ALIAS: Record<string, string> = {
  // business name
  name: "business_name",
  "business name": "business_name",
  "client name": "business_name",
  party: "business_name",
  "party name": "business_name",
  firm: "business_name",
  trade_name: "business_name",
  "trade name": "business_name",
  // gstin
  gst: "gstin",
  gstn: "gstin",
  "gst number": "gstin",
  gstin: "gstin",
  // pan
  pan: "pan",
  "pan number": "pan",
  pan_no: "pan",
  // contact
  contact: "contact_name",
  "contact person": "contact_name",
  contact_name: "contact_name",
  email: "contact_email",
  "email id": "contact_email",
  mail: "contact_email",
  contact_email: "contact_email",
  phone: "contact_phone",
  mobile: "contact_phone",
  "mobile number": "contact_phone",
  contact_phone: "contact_phone",
};

function parseCsv(text: string): Row[] {
  // Detect delimiter: tab > pipe > comma
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim =
    firstLine.includes("\t") ? "\t" :
    firstLine.includes("|") ? "|" : ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === delim && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const r: Row = {};
    headers.forEach((h, i) => { r[h] = cells[i] ?? ""; });
    return r;
  });
}

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const key = h.toLowerCase().trim().replace(/[_-]+/g, " ");
    const f = ALIAS[key] || ALIAS[h.toLowerCase().trim()] || (FIELDS.find((x) => x.key === h.toLowerCase().trim())?.key);
    if (f) map[f] = h;
  }
  return map;
}

function ImportClientsPage() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string>("");
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDupes, setSkipDupes] = useState(true);
  const [sendInvites, setSendInvites] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicatesSkipped: number; invitesCreated: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const commit = useServerFn(commitClientImport);

  const detected = useMemo(() => {
    const f = fileName.toLowerCase();
    if (f.endsWith(".xlsx") || f.endsWith(".xls")) return "Spectrum / Excel";
    if (f.endsWith(".txt")) return "CompuTax export";
    return "Generic CSV";
  }, [fileName]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Excel detected — please re-save as CSV (File → Save As → CSV) and re-upload.");
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("No data rows found in file.");
      return;
    }
    const hs = Object.keys(rows[0]);
    setRawRows(rows);
    setHeaders(hs);
    const m = autoMap(hs);
    setMapping(m);
    setStep(m.business_name ? 2 : 3);
  };

  const mappedRows = useMemo(() => {
    return rawRows
      .map((r) => {
        const out: Record<string, string> = {};
        for (const f of FIELDS) {
          const col = mapping[f.key];
          out[f.key] = col ? (r[col] ?? "").trim() : "";
        }
        return out;
      })
      .filter((r) => r.business_name);
  }, [rawRows, mapping]);

  const doImport = async () => {
    setBusy(true);
    try {
      const payload = {
        rows: mappedRows.map((r) => ({
          business_name: r.business_name,
          gstin: r.gstin,
          pan: r.pan,
          contact_name: r.contact_name,
          contact_email: r.contact_email,
          contact_phone: r.contact_phone,
        })),
        skipDuplicates: skipDupes,
        sendInvites,
      };
      const r = await commit({ data: payload });
      setResult(r);
      setStep(5);
      toast.success(`${r.imported} clients imported, ${r.duplicatesSkipped} duplicates skipped`);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <h1 className="font-display text-3xl font-semibold mt-1">Import your existing clients</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bring in client master data from CompuTax, Spectrum, or any CSV — in about 2 minutes.
        </p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <section className="rounded-3xl border-2 border-dashed border-border bg-card p-10 text-center">
          <div className="size-14 mx-auto rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Upload className="size-6" />
          </div>
          <h2 className="font-display text-lg font-semibold mt-4">Upload your client list</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Accepted formats: CompuTax export (.txt / .csv), Spectrum-style CSV, or a generic CSV with Name, GSTIN, PAN, Email, Phone.
            For .xlsx files, please save as CSV first.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
          />
          <Button className="mt-5 gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Choose file
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <h2 className="font-display text-lg font-semibold">
              Detected: {detected} — {rawRows.length} rows
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Preview of the first 5 clients we&apos;ll import:
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="p-2 px-3 font-medium">Name</th>
                  <th className="p-2 px-3 font-medium">GSTIN</th>
                  <th className="p-2 px-3 font-medium">PAN</th>
                  <th className="p-2 px-3 font-medium">Email</th>
                  <th className="p-2 px-3 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 px-3 font-medium">{r.business_name}</td>
                    <td className="p-2 px-3 font-mono text-xs">{r.gstin || "—"}</td>
                    <td className="p-2 px-3 font-mono text-xs">{r.pan || "—"}</td>
                    <td className="p-2 px-3">{r.contact_email || "—"}</td>
                    <td className="p-2 px-3">{r.contact_phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(3)}>Adjust column mapping</Button>
            <Button onClick={() => setStep(4)} className="gap-2">
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            <h2 className="font-display text-lg font-semibold">Map your columns</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Match the columns from your file to PracticeDesk fields. Required: Business name.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Select
                  value={mapping[f.key] ?? "__none__"}
                  onValueChange={(v) =>
                    setMapping((prev) => ({ ...prev, [f.key]: v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— not mapped —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— not mapped —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              disabled={!mapping.business_name}
              onClick={() => setStep(4)}
              className="gap-2"
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Review &amp; import {mappedRows.length} clients</h2>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={skipDupes} onCheckedChange={(v) => setSkipDupes(!!v)} className="mt-0.5" />
            <div>
              <div className="text-sm font-medium">Skip duplicates</div>
              <p className="text-xs text-muted-foreground">Match by GSTIN or business name against existing clients.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={sendInvites} onCheckedChange={(v) => setSendInvites(!!v)} className="mt-0.5" />
            <div>
              <div className="text-sm font-medium">Generate invite links automatically</div>
              <p className="text-xs text-muted-foreground">A secure invite link is created for each new client (uncheck to import data only).</p>
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>Start over</Button>
            <Button onClick={doImport} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Import {mappedRows.length} clients
            </Button>
          </div>
        </section>
      )}

      {step === 5 && result && (
        <section className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-6 md:p-8 space-y-3 text-center">
          <CheckCircle2 className="size-12 text-emerald-600 mx-auto" />
          <h2 className="font-display text-2xl font-semibold">All done!</h2>
          <p className="text-sm">
            <strong>{result.imported}</strong> clients imported
            {result.duplicatesSkipped > 0 && <>, <strong>{result.duplicatesSkipped}</strong> duplicates skipped</>}
            {result.invitesCreated > 0 && <>, <strong>{result.invitesCreated}</strong> invite links generated</>}.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Link to="/ca/clients"><Button>View clients</Button></Link>
            <Link to="/ca/dashboard"><Button variant="outline">Go to dashboard</Button></Link>
          </div>
        </section>
      )}

      <div className="text-center pt-4">
        <Link to="/ca/settings" className="text-xs text-muted-foreground hover:text-foreground">← Back to settings</Link>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Upload", "Preview", "Map", "Review", "Done"];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} className="flex items-center gap-2 shrink-0">
            <div className={`size-7 rounded-full grid place-items-center text-xs font-semibold ${
              done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {done ? "✓" : n}
            </div>
            <span className={`text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>{l}</span>
            {n < labels.length && <span className="text-muted-foreground/40">—</span>}
          </div>
        );
      })}
    </div>
  );
}
