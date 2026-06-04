/**
 * Tally file parsers — XML (TallyPrime / ERP9), Excel daybook, GSTR-1 JSON/XML.
 * Pure server module. Worker-safe (fast-xml-parser + xlsx).
 */
import { XMLParser } from "fast-xml-parser";
import * as XLSX from "xlsx";

export type TallyVersion = "TALLY_ERP9" | "TALLYPRIME" | "UNKNOWN";

export type ParsedRow = {
  date: string | null;            // ISO yyyy-mm-dd
  voucherNo: string | null;
  voucherType: string | null;     // Sales / Purchase / Journal / ...
  party: string | null;
  partyGstin: string | null;
  amount: number;                 // total inc. tax (best effort)
  taxableValue: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  totalTax: number | null;
  ledger: string;                 // primary income/expense ledger for mapping
  narration: string | null;
  rate: number | null;
};

export type ParseResult = {
  rows: ParsedRow[];
  version: TallyVersion;
  periodFrom: string | null;
  periodTo: string | null;
};

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[, ₹]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (raw: unknown): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  // Tally XML uses yyyymmdd
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // Excel date serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 10000 && n < 80000) {
      const d = XLSX.SSF?.parse_date_code?.(n);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const detectXmlVersion = (raw: string): TallyVersion => {
  const lower = raw.toLowerCase();
  if (lower.includes("tallyprime")) return "TALLYPRIME";
  if (lower.includes("tally.erp 9") || lower.includes("erp 9")) return "TALLY_ERP9";
  if (lower.includes("<envelope") || lower.includes("<tallymessage")) return "TALLYPRIME";
  return "UNKNOWN";
};

const asArray = <T,>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

const guessRateFromLedger = (name: string): number | null => {
  const m = name.match(/(\d{1,2})\s*%/);
  if (m) return Number(m[1]);
  return null;
};

/* ----------------------- Tally XML ----------------------- */

export function parseTallyXml(raw: string): ParseResult {
  const version = detectXmlVersion(raw);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  });
  let doc: any;
  try { doc = parser.parse(raw); } catch { return { rows: [], version, periodFrom: null, periodTo: null }; }

  // Navigate to TALLYMESSAGE[]
  const envelope = doc?.ENVELOPE ?? doc?.envelope;
  let messages: any[] = [];
  if (envelope) {
    const body = envelope.BODY ?? envelope.body;
    const importData = body?.IMPORTDATA ?? body?.importdata ?? body?.EXPORTDATA ?? body?.exportdata;
    const requestData = importData?.REQUESTDATA ?? importData?.requestdata;
    messages = asArray(requestData?.TALLYMESSAGE ?? requestData?.tallymessage);
  } else if (doc?.TALLYMESSAGE) {
    messages = asArray(doc.TALLYMESSAGE);
  }

  const rows: ParsedRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const msg of messages) {
    const voucher = msg?.VOUCHER ?? msg?.voucher;
    if (!voucher) continue;
    const vList = asArray(voucher);
    for (const v of vList) {
      const date = toIsoDate(v?.DATE ?? v?.date);
      const voucherType = v?.["@_VCHTYPE"] ?? v?.VOUCHERTYPENAME ?? v?.["@_TYPE"] ?? null;
      const voucherNo = v?.VOUCHERNUMBER ?? v?.["@_VOUCHERNUMBER"] ?? null;
      const party = v?.PARTYLEDGERNAME ?? v?.PARTYNAME ?? null;
      const partyGstin = v?.PARTYGSTIN ?? v?.GSTIN ?? null;
      const narration = v?.NARRATION ?? null;

      if (date) {
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }

      // Ledger entries
      const entries: any[] = [];
      const ldg = v?.["LEDGERENTRIES.LIST"] ?? v?.["ALLLEDGERENTRIES.LIST"] ?? v?.LEDGERENTRIES ?? [];
      entries.push(...asArray(ldg));

      // Primary non-party ledger = the income/expense one
      let primary: any = null;
      let totalAmount = 0;
      let cgst: number | null = null, sgst: number | null = null, igst: number | null = null;
      for (const e of entries) {
        const name: string = e?.LEDGERNAME ?? e?.["@_LEDGERNAME"] ?? "";
        const amt = num(e?.AMOUNT ?? e?.["@_AMOUNT"]);
        totalAmount = Math.max(totalAmount, Math.abs(amt));
        const low = name.toLowerCase();
        if (low.includes("cgst")) cgst = (cgst ?? 0) + Math.abs(amt);
        else if (low.includes("sgst")) sgst = (sgst ?? 0) + Math.abs(amt);
        else if (low.includes("igst")) igst = (igst ?? 0) + Math.abs(amt);
        else if (party && name && name !== party && !primary) primary = { name, amount: Math.abs(amt) };
      }
      const ledger = primary?.name ?? entries[0]?.LEDGERNAME ?? "Unknown";
      const taxable = primary?.amount ?? null;
      const totalTax = (cgst ?? 0) + (sgst ?? 0) + (igst ?? 0) || null;

      rows.push({
        date,
        voucherNo: voucherNo ? String(voucherNo) : null,
        voucherType: voucherType ? String(voucherType) : null,
        party: party ? String(party) : null,
        partyGstin: partyGstin ? String(partyGstin) : null,
        amount: totalAmount,
        taxableValue: taxable,
        cgst,
        sgst,
        igst,
        totalTax,
        ledger: String(ledger),
        narration: narration ? String(narration) : null,
        rate: guessRateFromLedger(String(ledger)),
      });
    }
  }

  return { rows, version, periodFrom: minDate, periodTo: maxDate };
}

/* ----------------------- Tally Excel daybook ----------------------- */

const HEADER_KEYS = ["date", "voucher no", "voucher no.", "ref no", "ref date", "narration", "party name", "alias", "debit", "credit", "closing balance"];

export function parseTallyExcel(buf: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], version: "UNKNOWN", periodFrom: null, periodTo: null };
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[][];

  // Find header row
  let headerIdx = -1;
  let headerMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i].map((c) => String(c ?? "").trim().toLowerCase());
    const hits = row.filter((c) => HEADER_KEYS.includes(c)).length;
    if (hits >= 3) {
      headerIdx = i;
      row.forEach((c, j) => (headerMap[c] = j));
      break;
    }
  }
  if (headerIdx === -1) return { rows: [], version: "UNKNOWN", periodFrom: null, periodTo: null };

  const get = (row: any[], ...keys: string[]) => {
    for (const k of keys) if (headerMap[k] !== undefined) return row[headerMap[k]];
    return undefined;
  };

  const rows: ParsedRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every((c) => c === null || c === "" || c === undefined)) continue;
    const date = toIsoDate(get(r, "date"));
    if (!date) continue;
    const debit = num(get(r, "debit"));
    const credit = num(get(r, "credit"));
    const amount = debit || credit;
    if (!amount) continue;
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    const party = get(r, "party name") ?? get(r, "alias");
    const narration = get(r, "narration");
    rows.push({
      date,
      voucherNo: get(r, "voucher no.") ? String(get(r, "voucher no.")) : (get(r, "voucher no") ? String(get(r, "voucher no")) : null),
      voucherType: credit > 0 ? "Sales" : "Purchase",
      party: party ? String(party) : null,
      partyGstin: null,
      amount,
      taxableValue: null,
      cgst: null,
      sgst: null,
      igst: null,
      totalTax: null,
      ledger: party ? String(party) : (narration ? String(narration).slice(0, 40) : "Unknown"),
      narration: narration ? String(narration) : null,
      rate: null,
    });
  }

  return { rows, version: "UNKNOWN", periodFrom: minDate, periodTo: maxDate };
}

/* ----------------------- GSTR-1 JSON ----------------------- */

export function parseGstr1Json(raw: string): ParseResult {
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return { rows: [], version: "UNKNOWN", periodFrom: null, periodTo: null }; }
  const rows: ParsedRow[] = [];
  let minDate: string | null = null, maxDate: string | null = null;

  const pushRow = (r: ParsedRow) => {
    if (r.date) {
      if (!minDate || r.date < minDate) minDate = r.date;
      if (!maxDate || r.date > maxDate) maxDate = r.date;
    }
    rows.push(r);
  };

  // b2b
  for (const buyer of obj?.b2b ?? []) {
    for (const inv of buyer?.inv ?? []) {
      const date = toIsoDate(inv?.idt);
      let taxable = 0, cgst = 0, sgst = 0, igst = 0;
      for (const it of inv?.itms ?? []) {
        taxable += num(it?.itm_det?.txval);
        cgst += num(it?.itm_det?.camt);
        sgst += num(it?.itm_det?.samt);
        igst += num(it?.itm_det?.iamt);
      }
      pushRow({
        date, voucherNo: String(inv?.inum ?? ""), voucherType: "Sales",
        party: null, partyGstin: buyer?.ctin ?? null,
        amount: num(inv?.val) || taxable + cgst + sgst + igst,
        taxableValue: taxable, cgst: cgst || null, sgst: sgst || null, igst: igst || null,
        totalTax: (cgst + sgst + igst) || null,
        ledger: igst > 0 ? "Sales Interstate" : "Sales Local",
        narration: null,
        rate: inv?.itms?.[0]?.itm_det?.rt ?? null,
      });
    }
  }
  return { rows, version: "UNKNOWN", periodFrom: minDate, periodTo: maxDate };
}

/* ----------------------- Dispatcher ----------------------- */

export function parseTallyFile(opts: {
  fileName: string;
  content: ArrayBuffer | string;
  importType: "SALES_LEDGER" | "PURCHASE_LEDGER" | "GSTR1_DATA" | "GSTR2_DATA" | "FULL_BACKUP";
}): ParseResult {
  const ext = opts.fileName.toLowerCase().split(".").pop();
  if (ext === "xml") {
    const text = typeof opts.content === "string" ? opts.content : new TextDecoder().decode(opts.content);
    return parseTallyXml(text);
  }
  if (ext === "json") {
    const text = typeof opts.content === "string" ? opts.content : new TextDecoder().decode(opts.content);
    return parseGstr1Json(text);
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const buf = typeof opts.content === "string"
      ? new TextEncoder().encode(opts.content).buffer
      : opts.content;
    return parseTallyExcel(buf);
  }
  return { rows: [], version: "UNKNOWN", periodFrom: null, periodTo: null };
}
