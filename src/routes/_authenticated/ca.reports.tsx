import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileDown, FileJson, FileSpreadsheet, FileText, FileCode2,
  Package, Upload, GitCompare, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/ca/reports")({ component: ExportsPage });

type Inv = {
  id: string;
  client_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  vendor_gstin: string | null;
  buyer_name: string | null;
  buyer_gstin: string | null;
  place_of_supply: string | null;
  taxable_value: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  cess: number | null;
  total_amount: number | null;
  status: string;
  document_category: string | null;
};

type Client = { id: string; business_name: string; gstin: string | null };

type Format = "gstr1" | "excel" | "csv" | "tally";

const FORMAT_META: Record<Format, { label: string; ext: string; icon: any; mime: string }> = {
  gstr1: { label: "GSTR-1 JSON", ext: "json", icon: FileJson, mime: "application/json" },
  excel: { label: "Excel (.xlsx)", ext: "xlsx", icon: FileSpreadsheet, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  csv: { label: "CSV", ext: "csv", icon: FileText, mime: "text/csv" },
  tally: { label: "Tally XML", ext: "xml", icon: FileCode2, mime: "application/xml" },
};

function download(filename: string, data: Blob | string, mime?: string) {
  const blob = typeof data === "string" ? new Blob([data], { type: mime || "text/plain" }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const num = (n: any) => Number(n || 0);
const sum = (arr: Inv[], k: keyof Inv) => arr.reduce((s, i) => s + num(i[k]), 0);
const safeName = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40);

// ---------- format generators ----------
function buildCSV(invs: Inv[]): string {
  const headers = ["Invoice No","Date","Vendor","Vendor GSTIN","Buyer","Buyer GSTIN","Place of Supply","Category","Taxable","CGST","SGST","IGST","CESS","Total","Status"];
  const rows = invs.map((i) => [
    i.invoice_number, i.invoice_date, i.vendor_name, i.vendor_gstin,
    i.buyer_name, i.buyer_gstin, i.place_of_supply, i.document_category,
    num(i.taxable_value), num(i.cgst), num(i.sgst), num(i.igst), num(i.cess), num(i.total_amount), i.status,
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
}

function buildExcel(invs: Inv[], clientName: string, period: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const headerRows = invs.map((i) => ({
    "Invoice No": i.invoice_number || "",
    "Date": i.invoice_date || "",
    "Vendor": i.vendor_name || "",
    "Vendor GSTIN": i.vendor_gstin || "",
    "Buyer": i.buyer_name || "",
    "Buyer GSTIN": i.buyer_gstin || "",
    "Place of Supply": i.place_of_supply || "",
    "Category": i.document_category || "",
    "Taxable": num(i.taxable_value),
    "CGST": num(i.cgst),
    "SGST": num(i.sgst),
    "IGST": num(i.igst),
    "CESS": num(i.cess),
    "Total": num(i.total_amount),
    "Status": i.status,
  }));
  const summaryRows = [
    ["Client", clientName],
    ["Period", period],
    ["Invoices", invs.length],
    ["Taxable value", sum(invs, "taxable_value")],
    ["CGST", sum(invs, "cgst")],
    ["SGST", sum(invs, "sgst")],
    ["IGST", sum(invs, "igst")],
    ["CESS", sum(invs, "cess")],
    ["Total invoice value", sum(invs, "total_amount")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headerRows), "Invoices");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function buildGSTR1(invs: Inv[], period: string): string {
  const gstin = invs[0]?.vendor_gstin ?? "";
  const fp = period.slice(5, 7) + period.slice(0, 4); // MMYYYY
  const groups: Record<string, Inv[]> = {};
  invs.forEach((i) => {
    const k = i.buyer_gstin || "UNREGISTERED";
    (groups[k] ||= []).push(i);
  });
  const b2b: any[] = [];
  Object.entries(groups).forEach(([ctin, list]) => {
    if (ctin === "UNREGISTERED") return;
    b2b.push({
      ctin,
      inv: list.map((i) => ({
        inum: i.invoice_number,
        idt: i.invoice_date,
        val: num(i.total_amount),
        pos: i.place_of_supply ?? "",
        rchrg: "N",
        inv_typ: "R",
        itms: [{
          num: 1,
          itm_det: {
            txval: num(i.taxable_value),
            rt: 18,
            camt: num(i.cgst),
            samt: num(i.sgst),
            iamt: num(i.igst),
            csamt: num(i.cess),
          },
        }],
      })),
    });
  });
  const payload = { gstin, fp, gt: sum(invs, "total_amount"), cur_gt: 0, b2b };
  return JSON.stringify(payload, null, 2);
}

const xmlEsc = (s: any) => (s ?? "").toString()
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function buildTallyXML(invs: Inv[], clientName: string): string {
  const vouchers = invs.map((i) => `
        <VOUCHER VCHTYPE="Sales" ACTION="Create">
          <DATE>${xmlEsc((i.invoice_date || "").replace(/-/g, ""))}</DATE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${xmlEsc(i.invoice_number)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${xmlEsc(i.buyer_name || "Unknown Party")}</PARTYLEDGERNAME>
          <PARTYGSTIN>${xmlEsc(i.buyer_gstin)}</PARTYGSTIN>
          <PLACEOFSUPPLY>${xmlEsc(i.place_of_supply)}</PLACEOFSUPPLY>
          <REFERENCE>${xmlEsc(i.invoice_number)}</REFERENCE>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${xmlEsc(i.buyer_name || "Unknown Party")}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${num(i.total_amount).toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Sales</LEDGERNAME>
            <AMOUNT>${num(i.taxable_value).toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><AMOUNT>${num(i.cgst).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><AMOUNT>${num(i.sgst).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><AMOUNT>${num(i.igst).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>
        </VOUCHER>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEsc(clientName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function generate(format: Format, invs: Inv[], client: Client, period: string): { name: string; data: string | ArrayBuffer } {
  const base = `${safeName(client.business_name)}-${period}`;
  if (format === "csv") return { name: `${base}.csv`, data: buildCSV(invs) };
  if (format === "gstr1") return { name: `${base}-gstr1.json`, data: buildGSTR1(invs, period) };
  if (format === "tally") return { name: `${base}-tally.xml`, data: buildTallyXML(invs, client.business_name) };
  return { name: `${base}.xlsx`, data: buildExcel(invs, client.business_name, period) };
}

// ---------- page ----------
function ExportsPage() {
  const { firm } = useTenant();
  const [invs, setInvs] = useState<Inv[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [bulkSel, setBulkSel] = useState<Set<string>>(new Set());
  const [bulkFormat, setBulkFormat] = useState<Format>("excel");

  useEffect(() => {
    if (!firm?.id) return;
    (async () => {
      const [{ data: i }, { data: c }] = await Promise.all([
        supabase.from("invoices").select("*").eq("ca_firm_id", firm.id).order("invoice_date", { ascending: false }),
        supabase.from("clients").select("id, business_name, gstin").eq("ca_firm_id", firm.id).order("business_name"),
      ]);
      setInvs((i as any) ?? []);
      setClients((c as any) ?? []);
    })();
  }, [firm?.id]);

  const periodInvs = useMemo(
    () => invs.filter((i) => (i.invoice_date || "").startsWith(period)),
    [invs, period],
  );

  const filteredForClient = useMemo(
    () => clientFilter === "all" ? periodInvs : periodInvs.filter((i) => i.client_id === clientFilter),
    [periodInvs, clientFilter],
  );

  const activeClient: Client = useMemo(() => {
    if (clientFilter === "all") return { id: "all", business_name: "All clients", gstin: null };
    return clients.find((c) => c.id === clientFilter) ?? { id: "all", business_name: "All clients", gstin: null };
  }, [clients, clientFilter]);

  const singleExport = (format: Format) => {
    if (filteredForClient.length === 0) { toast.error("No invoices in this period"); return; }
    const out = generate(format, filteredForClient, activeClient, period);
    download(out.name, typeof out.data === "string" ? out.data : new Blob([out.data], { type: FORMAT_META[format].mime }), FORMAT_META[format].mime);
    toast.success(`${FORMAT_META[format].label} downloaded`);
    if (firm?.id) {
      const targets = clientFilter === "all"
        ? Array.from(new Set(filteredForClient.map((i) => i.client_id)))
        : [clientFilter];
      targets.forEach((cid) => {
        const count = filteredForClient.filter((i) => i.client_id === cid).length;
        logActivity({
          ca_firm_id: firm.id,
          client_id: cid,
          action: "report_exported",
          entity_type: "export",
          metadata: { format: FORMAT_META[format].label, period, count, scope: clientFilter === "all" ? "all_clients" : "single" },
        });
      });
    }
  };

  const toggleBulk = (id: string) => {
    const next = new Set(bulkSel);
    next.has(id) ? next.delete(id) : next.add(id);
    setBulkSel(next);
  };

  const bulkExport = async () => {
    if (bulkSel.size === 0) { toast.error("Select at least one client"); return; }
    const zip = new JSZip();
    let totalInvs = 0;
    const logged: { cid: string; count: number }[] = [];
    for (const cid of bulkSel) {
      const client = clients.find((c) => c.id === cid);
      if (!client) continue;
      const list = periodInvs.filter((i) => i.client_id === cid);
      if (list.length === 0) continue;
      totalInvs += list.length;
      const out = generate(bulkFormat, list, client, period);
      const folder = zip.folder(safeName(client.business_name));
      folder?.file(out.name, out.data as any);
      logged.push({ cid, count: list.length });
    }
    if (totalInvs === 0) { toast.error("Selected clients have no invoices in this period"); return; }
    const blob = await zip.generateAsync({ type: "blob" });
    download(`gstify-exports-${period}.zip`, blob);
    toast.success(`Exported ${bulkSel.size} client(s) as ZIP`);
    if (firm?.id) {
      logged.forEach(({ cid, count }) => {
        logActivity({
          ca_firm_id: firm.id,
          client_id: cid,
          action: "report_exported",
          entity_type: "export",
          metadata: { format: FORMAT_META[bulkFormat].label, period, count, scope: "bulk_zip" },
        });
      });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl font-semibold">Reports &amp; Export Center</h1>
      <p className="text-muted-foreground mt-1">GSTR-1 JSON, Excel, CSV, Tally XML — for one client or many, in one click.</p>

      <Tabs defaultValue="single" className="mt-6">
        <TabsList>
          <TabsTrigger value="single" className="gap-1.5"><FileDown className="size-4"/> Per client</TabsTrigger>
          <TabsTrigger value="bulk" className="gap-1.5"><Package className="size-4"/> Bulk export</TabsTrigger>
          <TabsTrigger value="recon" className="gap-1.5"><GitCompare className="size-4"/> GSTR-2A reconciliation</TabsTrigger>
        </TabsList>

        {/* ----- single client ----- */}
        <TabsContent value="single" className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Period</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Client</label>
              <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm min-w-[220px]">
                <option value="all">All clients</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
            </div>
            <div className="text-sm text-muted-foreground pb-2">{filteredForClient.length} invoice(s) in period</div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.keys(FORMAT_META) as Format[]).map((f) => {
              const m = FORMAT_META[f]; const Icon = m.icon;
              return (
                <div key={f} className="p-5 rounded-2xl border border-border bg-card flex flex-col">
                  <Icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-display text-base font-semibold">{m.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1 flex-1">
                    {f === "gstr1" && "Filing-ready JSON for the GST portal."}
                    {f === "excel" && "Itemized invoices with totals — opens in Excel."}
                    {f === "csv" && "Comma-separated rows for any tool."}
                    {f === "tally" && "Voucher XML import for Tally ERP."}
                  </p>
                  <Button size="sm" onClick={() => singleExport(f)} className="mt-4 w-full gap-1.5"
                    disabled={!filteredForClient.length}>
                    <FileDown className="size-4"/> Download
                  </Button>
                </div>
              );
            })}
          </div>

          <PreviewTable invs={filteredForClient} />
        </TabsContent>

        {/* ----- bulk ----- */}
        <TabsContent value="bulk" className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Period</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Format</label>
              <select value={bulkFormat} onChange={(e) => setBulkFormat(e.target.value as Format)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm min-w-[200px]">
                {(Object.keys(FORMAT_META) as Format[]).map((f) => <option key={f} value={f}>{FORMAT_META[f].label}</option>)}
              </select>
            </div>
            <Button onClick={bulkExport} className="gap-2" disabled={bulkSel.size === 0}>
              <Package className="size-4"/> Export {bulkSel.size || ""} client{bulkSel.size === 1 ? "" : "s"} as ZIP
            </Button>
            <div className="flex gap-2 pb-1">
              <button className="text-xs text-primary hover:underline" onClick={() => setBulkSel(new Set(clients.map((c) => c.id)))}>Select all</button>
              <span className="text-xs text-muted-foreground">·</span>
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setBulkSel(new Set())}>Clear</button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium text-right">Invoices in period</th>
                  <th className="px-4 py-3 font-medium text-right">Total value</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No clients yet.</td></tr>}
                {clients.map((c) => {
                  const list = periodInvs.filter((i) => i.client_id === c.id);
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3"><Checkbox checked={bulkSel.has(c.id)} onCheckedChange={() => toggleBulk(c.id)} /></td>
                      <td className="px-4 py-3 font-medium">{c.business_name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.gstin || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{list.length}</td>
                      <td className="px-4 py-3 text-right tabular-nums">₹{sum(list, "total_amount").toLocaleString("en-IN")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ----- recon ----- */}
        <TabsContent value="recon" className="mt-6">
          <ReconView invs={periodInvs} clients={clients} period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewTable({ invs }: { invs: Inv[] }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Preview</h2>
      <p className="text-xs text-muted-foreground mt-0.5">Rows included in the exports above.</p>
      <div className="mt-3 rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>{["Invoice #","Vendor","GSTIN","Date","Taxable","Total","Status"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {invs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No invoices for this period.</td></tr>}
            {invs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.invoice_number || "—"}</td>
                <td className="px-4 py-3">{r.vendor_name || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.vendor_gstin || "—"}</td>
                <td className="px-4 py-3">{r.invoice_date || "—"}</td>
                <td className="px-4 py-3 tabular-nums">₹{num(r.taxable_value).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 tabular-nums">₹{num(r.total_amount).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- GSTR-2A recon ----------
type Gstr2aRow = {
  vendor_gstin: string;
  invoice_number: string;
  invoice_date: string;
  taxable_value: number;
  total_amount: number;
};

type ReconRow = {
  key: string;
  uploaded?: Inv;
  portal?: Gstr2aRow;
  match: "matched" | "missing_in_portal" | "missing_in_uploads" | "mismatch";
  diff?: { taxable?: number; total?: number };
};

const reconKey = (gstin: string | null | undefined, inum: string | null | undefined) =>
  `${(gstin || "").toUpperCase().trim()}|${(inum || "").trim()}`;

function parseGstr2aCSV(text: string): Gstr2aRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let inq = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inq && line[i + 1] === '"') { cur += '"'; i++; } else inq = !inq; }
      else if (ch === "," && !inq) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseRow(lines[0]).map((h) => h.toLowerCase());
  const findIdx = (...names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const gIdx = findIdx("gstin");
  const iIdx = findIdx("invoice no", "invoice number", "inv no");
  const dIdx = findIdx("invoice date", "inv date", "date");
  const tIdx = findIdx("taxable", "txval");
  const totIdx = findIdx("total", "invoice value");
  return lines.slice(1).map((l) => {
    const cells = parseRow(l);
    return {
      vendor_gstin: cells[gIdx] ?? "",
      invoice_number: cells[iIdx] ?? "",
      invoice_date: cells[dIdx] ?? "",
      taxable_value: Number((cells[tIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
      total_amount: Number((cells[totIdx] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
    };
  }).filter((r) => r.invoice_number);
}

function ReconView({ invs, clients, period }: { invs: Inv[]; clients: Client[]; period: string }) {
  const [clientId, setClientId] = useState<string>("all");
  const [portal, setPortal] = useState<Gstr2aRow[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    const rows = parseGstr2aCSV(text);
    setPortal(rows);
    toast.success(`Loaded ${rows.length} rows from ${f.name}`);
  };

  const scoped = useMemo(
    () => clientId === "all" ? invs : invs.filter((i) => i.client_id === clientId),
    [invs, clientId],
  );

  const recon = useMemo<ReconRow[]>(() => {
    const out: ReconRow[] = [];
    const portalMap = new Map<string, Gstr2aRow>();
    portal.forEach((p) => portalMap.set(reconKey(p.vendor_gstin, p.invoice_number), p));
    const seen = new Set<string>();
    scoped.forEach((u) => {
      const k = reconKey(u.vendor_gstin, u.invoice_number);
      seen.add(k);
      const p = portalMap.get(k);
      if (!p) { out.push({ key: k, uploaded: u, match: "missing_in_portal" }); return; }
      const tDiff = Math.round((p.taxable_value - num(u.taxable_value)) * 100) / 100;
      const totDiff = Math.round((p.total_amount - num(u.total_amount)) * 100) / 100;
      if (Math.abs(tDiff) > 1 || Math.abs(totDiff) > 1) {
        out.push({ key: k, uploaded: u, portal: p, match: "mismatch", diff: { taxable: tDiff, total: totDiff } });
      } else {
        out.push({ key: k, uploaded: u, portal: p, match: "matched" });
      }
    });
    portal.forEach((p) => {
      const k = reconKey(p.vendor_gstin, p.invoice_number);
      if (!seen.has(k)) out.push({ key: k, portal: p, match: "missing_in_uploads" });
    });
    return out;
  }, [scoped, portal]);

  const counts = {
    matched: recon.filter((r) => r.match === "matched").length,
    mismatch: recon.filter((r) => r.match === "mismatch").length,
    portalOnly: recon.filter((r) => r.match === "missing_in_uploads").length,
    uploadsOnly: recon.filter((r) => r.match === "missing_in_portal").length,
  };

  const rowClass = (m: ReconRow["match"]) => ({
    matched: "bg-emerald-50/60 dark:bg-emerald-950/20",
    mismatch: "bg-red-50/60 dark:bg-red-950/20",
    missing_in_portal: "bg-amber-50/60 dark:bg-amber-950/20",
    missing_in_uploads: "bg-amber-50/60 dark:bg-amber-950/20",
  }[m]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dashed border-border bg-card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <h3 className="font-display text-base font-semibold">Upload GSTR-2A export</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Download GSTR-2A from the GST portal as CSV (period {period}) and upload it here. We'll match it row-by-row against the invoices you uploaded for the selected client.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm min-w-[200px]">
              <option value="all">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:bg-primary/90">
              <Upload className="size-4"/> {portal.length ? "Re-upload" : "Upload CSV"}
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        {fileName && (
          <div className="mt-3 text-xs text-muted-foreground">Loaded <span className="font-mono">{fileName}</span> — {portal.length} portal rows.</div>
        )}
      </div>

      {portal.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <GitCompare className="size-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground text-sm">Upload a GSTR-2A CSV to start reconciliation.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryPill icon={<CheckCircle2 className="size-4"/>} label="Matched" value={counts.matched} tone="success" />
            <SummaryPill icon={<AlertTriangle className="size-4"/>} label="Amount mismatch" value={counts.mismatch} tone="danger" />
            <SummaryPill icon={<AlertTriangle className="size-4"/>} label="In uploads, not in 2A" value={counts.uploadsOnly} tone="warn" />
            <SummaryPill icon={<AlertTriangle className="size-4"/>} label="In 2A, not uploaded" value={counts.portalOnly} tone="warn" />
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor GSTIN</th>
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Uploaded (taxable / total)</th>
                  <th className="px-4 py-3 font-medium">GSTR-2A (taxable / total)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recon.map((r) => (
                  <tr key={r.key} className={`border-t border-border ${rowClass(r.match)}`}>
                    <td className="px-4 py-3 font-mono text-xs">{r.uploaded?.vendor_gstin || r.portal?.vendor_gstin || "—"}</td>
                    <td className="px-4 py-3 font-medium">{r.uploaded?.invoice_number || r.portal?.invoice_number || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.uploaded ? `₹${num(r.uploaded.taxable_value).toLocaleString("en-IN")} / ₹${num(r.uploaded.total_amount).toLocaleString("en-IN")}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.portal ? `₹${r.portal.taxable_value.toLocaleString("en-IN")} / ₹${r.portal.total_amount.toLocaleString("en-IN")}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3"><ReconBadge match={r.match} diff={r.diff} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryPill({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "success" | "danger" | "warn" }) {
  const cls = {
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    danger: "bg-red-500/10 text-red-700 dark:text-red-400",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${cls}`}>{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold font-display">{value}</div>
    </div>
  );
}

function ReconBadge({ match, diff }: { match: ReconRow["match"]; diff?: ReconRow["diff"] }) {
  if (match === "matched") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Matched</Badge>;
  if (match === "mismatch") return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive">Amount mismatch</Badge>
      {diff && <span className="text-xs text-destructive">Δ ₹{(diff.total ?? 0).toLocaleString("en-IN")}</span>}
    </div>
  );
  if (match === "missing_in_portal") return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">Not in GSTR-2A</Badge>;
  return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">Not uploaded</Badge>;
}
