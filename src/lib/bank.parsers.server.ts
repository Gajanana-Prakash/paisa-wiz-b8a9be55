// Bank statement parsers for major Indian banks.
// Excel/CSV via `xlsx`; PDF via Lovable AI Gateway.

import * as XLSX from "xlsx";

export type ParsedTxn = {
  transaction_date: string; // YYYY-MM-DD
  value_date?: string | null;
  description: string;
  transaction_type: "CREDIT" | "DEBIT";
  amount: number;
  balance_after?: number | null;
  reference_number?: string | null;
};

export type ParseResult = {
  bank: string;
  txns: ParsedTxn[];
  opening_balance: number | null;
  closing_balance: number | null;
  period_from: string | null;
  period_to: string | null;
  needs_manual_mapping?: boolean;
  raw_rows?: any[];
  raw_headers?: string[];
};

const KNOWN_BANKS = [
  { key: "HDFC", patterns: [/hdfc/i, /narration/i] },
  { key: "SBI", patterns: [/state bank/i, /sbi/i, /txn date/i] },
  { key: "ICICI", patterns: [/icici/i, /transaction remarks/i] },
  { key: "AXIS", patterns: [/axis/i, /chqno/i, /particulars/i] },
  { key: "KOTAK", patterns: [/kotak/i, /mahindra/i] },
];

function detectBank(fileName: string, headerText: string): string | null {
  const hay = `${fileName} ${headerText}`;
  for (const b of KNOWN_BANKS) {
    if (b.patterns.some((p) => p.test(hay))) return b.key;
  }
  return null;
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[, ₹]/g, "").trim();
  if (!s || s === "-") return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseDateAny(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy or dd-MMM-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    let yy = m1[3];
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m2 = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3})[\-\s](\d{2,4})$/);
  if (m2) {
    const dd = m2[1].padStart(2, "0");
    const mm = months[m2[2].toLowerCase()];
    let yy = m2[3];
    if (yy.length === 2) yy = `20${yy}`;
    if (mm) return `${yy}-${mm}-${dd}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

const HEADER_MAP: Record<string, "date" | "value_date" | "desc" | "ref" | "debit" | "credit" | "balance"> = {
  "date": "date",
  "txn date": "date",
  "transaction date": "date",
  "tran date": "date",
  "value date": "value_date",
  "value dt": "value_date",
  "narration": "desc",
  "description": "desc",
  "particulars": "desc",
  "transaction remarks": "desc",
  "chq./ref.no.": "ref",
  "chqno": "ref",
  "ref no./cheque no.": "ref",
  "reference": "ref",
  "ref no": "ref",
  "withdrawal amt": "debit",
  "withdrawal amount": "debit",
  "debit": "debit",
  "dr": "debit",
  "deposit amt": "credit",
  "deposit amount": "credit",
  "credit": "credit",
  "cr": "credit",
  "closing balance": "balance",
  "balance": "balance",
  "bal": "balance",
};

function normalizeHeader(h: string): string {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [];
    let hits = 0;
    for (const cell of r) {
      const k = normalizeHeader(String(cell ?? ""));
      if (HEADER_MAP[k]) hits++;
    }
    if (hits >= 3) return i;
  }
  return -1;
}

function rowsToTxns(rows: any[][], headerRow: number): ParsedTxn[] {
  const headers = (rows[headerRow] || []).map((h) => normalizeHeader(String(h ?? "")));
  const colIdx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = HEADER_MAP[h];
    if (k && colIdx[k] === undefined) colIdx[k] = i;
  });
  const out: ParsedTxn[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.length) continue;
    const dateCell = colIdx.date !== undefined ? r[colIdx.date] : null;
    const date = parseDateAny(dateCell);
    if (!date) continue;
    const desc = colIdx.desc !== undefined ? String(r[colIdx.desc] ?? "").trim() : "";
    if (!desc && !dateCell) continue;
    const debit = colIdx.debit !== undefined ? num(r[colIdx.debit]) : 0;
    const credit = colIdx.credit !== undefined ? num(r[colIdx.credit]) : 0;
    if (debit === 0 && credit === 0) continue;
    const isCredit = credit > 0;
    out.push({
      transaction_date: date,
      value_date: colIdx.value_date !== undefined ? parseDateAny(r[colIdx.value_date]) : null,
      description: desc || "(no description)",
      transaction_type: isCredit ? "CREDIT" : "DEBIT",
      amount: isCredit ? credit : debit,
      balance_after: colIdx.balance !== undefined ? num(r[colIdx.balance]) : null,
      reference_number: colIdx.ref !== undefined ? String(r[colIdx.ref] ?? "").trim() || null : null,
    });
  }
  return out;
}

export async function parseExcelOrCsv(bytes: Uint8Array, fileName: string): Promise<ParseResult> {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
  const headerRow = findHeaderRow(rows);
  const headerText = rows.slice(0, Math.min(rows.length, 15)).flat().join(" ");
  const bank = detectBank(fileName, headerText) || "UNKNOWN";

  if (headerRow < 0) {
    return {
      bank,
      txns: [],
      opening_balance: null,
      closing_balance: null,
      period_from: null,
      period_to: null,
      needs_manual_mapping: true,
      raw_rows: rows.slice(0, 50),
      raw_headers: rows[0]?.map((c) => String(c ?? "")) || [],
    };
  }

  const txns = rowsToTxns(rows, headerRow);
  txns.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  return {
    bank,
    txns,
    opening_balance: txns[0]?.balance_after != null ? (txns[0].balance_after - (txns[0].transaction_type === "CREDIT" ? txns[0].amount : -txns[0].amount)) : null,
    closing_balance: txns[txns.length - 1]?.balance_after ?? null,
    period_from: txns[0]?.transaction_date ?? null,
    period_to: txns[txns.length - 1]?.transaction_date ?? null,
  };
}

/** Use Lovable AI Gateway to extract transactions from a bank statement PDF. */
export async function parsePdfWithAI(base64Pdf: string, fileName: string): Promise<ParseResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      bank: "UNKNOWN",
      txns: [],
      opening_balance: null,
      closing_balance: null,
      period_from: null,
      period_to: null,
      needs_manual_mapping: true,
    };
  }

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract ALL transactions from this Indian bank statement PDF. Return STRICT JSON only, no markdown, no commentary. Schema:
{
  "bank": "HDFC|SBI|ICICI|AXIS|KOTAK|OTHER",
  "opening_balance": number|null,
  "closing_balance": number|null,
  "period_from": "YYYY-MM-DD"|null,
  "period_to": "YYYY-MM-DD"|null,
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "...", "debit": number|null, "credit": number|null, "balance": number|null, "reference": "..."|null }
  ]
}
Use null where unknown. Do not invent values.`,
          },
          { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${base64Pdf}` } },
        ],
      },
    ],
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`AI PDF parse failed: ${resp.status} ${await resp.text().catch(() => "")}`);
  }
  const j = await resp.json();
  let text: string = j?.choices?.[0]?.message?.content ?? "";
  // Strip ```json fences if any
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("AI returned non-JSON output");
    parsed = JSON.parse(m[0]);
  }

  const txns: ParsedTxn[] = [];
  for (const t of parsed.transactions || []) {
    const date = parseDateAny(t.date);
    if (!date) continue;
    const credit = num(t.credit);
    const debit = num(t.debit);
    if (credit === 0 && debit === 0) continue;
    const isCredit = credit > 0;
    txns.push({
      transaction_date: date,
      description: String(t.description ?? "").trim() || "(no description)",
      transaction_type: isCredit ? "CREDIT" : "DEBIT",
      amount: isCredit ? credit : debit,
      balance_after: t.balance != null ? num(t.balance) : null,
      reference_number: t.reference ? String(t.reference) : null,
    });
  }
  txns.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  return {
    bank: parsed.bank || "UNKNOWN",
    txns,
    opening_balance: parsed.opening_balance != null ? num(parsed.opening_balance) : null,
    closing_balance: parsed.closing_balance != null ? num(parsed.closing_balance) : null,
    period_from: parseDateAny(parsed.period_from),
    period_to: parseDateAny(parsed.period_to),
  };
}

export function cleanDescription(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\b(NEFT|RTGS|IMPS|UPI|ACH|ECS|POS|ATM|CHQ|TFR|TRANSFER)\b[-:/]?/gi, (m) => `${m.toUpperCase().replace(/[-:/]$/, "")} `)
    .replace(/\b\d{10,}\b/g, "") // strip long ref numbers
    .replace(/\s+/g, " ")
    .trim();
}
