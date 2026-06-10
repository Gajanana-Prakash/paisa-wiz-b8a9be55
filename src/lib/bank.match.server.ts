// Auto-matching engine: heuristics + user rules.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const admin = supabaseAdmin as any;

export type MatchOutcome = {
  matched_invoice_id: string | null;
  match_confidence: number | null;
  matched_by: "AI" | "MANUAL" | "AUTO_RULE" | null;
  category: string;
  reconciliation_status: "MATCHED" | "UNMATCHED";
};

const CATEGORY_KEYWORDS: Array<{ kw: RegExp; cat: string }> = [
  { kw: /\b(gst|igst|cgst|sgst|tds|tax(\s+pmt)?)\b/i, cat: "TAX_PAYMENT" },
  { kw: /\b(salary|wages|payroll)\b/i, cat: "SALARY" },
  { kw: /\b(int\b|interest)/i, cat: "INTEREST" },
  { kw: /\b(bank\s*charge|commission|chrg|chgs|sms\s*chrg)\b/i, cat: "BANK_CHARGES" },
  { kw: /\b(emi|loan)\b/i, cat: "LOAN" },
];

function keywordCategory(desc: string): string {
  for (const { kw, cat } of CATEGORY_KEYWORDS) {
    if (kw.test(desc)) return cat;
  }
  return "UNKNOWN";
}

function partyNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|limited|ltd|llp|inc|corp|company|co|enterprises|traders|sons)\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

export async function matchTransaction(opts: {
  firmId: string;
  clientId: string;
  txn: {
    transaction_date: string;
    description: string;
    transaction_type: "CREDIT" | "DEBIT";
    amount: number;
    reference_number?: string | null;
  };
  tolerance: number;
  dateWindowDays: number;
  rules: Array<{
    id: string;
    description_contains: string;
    amount_min: number | null;
    amount_max: number | null;
    category: string;
  }>;
}): Promise<MatchOutcome> {
  const { firmId, clientId, txn, tolerance, dateWindowDays, rules } = opts;
  const desc = txn.description || "";
  const descLc = desc.toLowerCase();

  // Apply user rules first (categorization only — no invoice match)
  for (const r of rules) {
    const needle = (r.description_contains || "").trim().toLowerCase();
    if (!needle) continue;
    if (!descLc.includes(needle)) continue;
    if (r.amount_min != null && txn.amount < r.amount_min) continue;
    if (r.amount_max != null && txn.amount > r.amount_max) continue;
    return {
      matched_invoice_id: null,
      match_confidence: 1,
      matched_by: "AUTO_RULE",
      category: r.category,
      reconciliation_status: "UNMATCHED",
    };
  }

  // Attempt 3 (highest confidence): reference number match
  if (txn.reference_number && txn.reference_number.length >= 4) {
    const ref = txn.reference_number;
    const { data: refMatches } = await admin
      .from("invoices")
      .select("id, invoice_number, total_amount, invoice_date, vendor_name, buyer_name")
      .eq("ca_firm_id", firmId)
      .eq("client_id", clientId)
      .or(`invoice_number.ilike.%${ref}%`)
      .limit(5);
    if (refMatches && refMatches.length === 1) {
      return {
        matched_invoice_id: refMatches[0].id,
        match_confidence: 0.99,
        matched_by: "AI",
        category: txn.transaction_type === "CREDIT" ? "SALES_RECEIPT" : "PURCHASE_PAYMENT",
        reconciliation_status: "MATCHED",
      };
    }
  }

  // Amount + date window candidates
  const fromDate = new Date(txn.transaction_date);
  fromDate.setDate(fromDate.getDate() - dateWindowDays);
  const toDate = new Date(txn.transaction_date);
  toDate.setDate(toDate.getDate() + dateWindowDays);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("invoices")
    .select("id, invoice_number, total_amount, invoice_date, vendor_name, buyer_name")
    .eq("ca_firm_id", firmId)
    .eq("client_id", clientId)
    .gte("invoice_date", fromStr)
    .lte("invoice_date", toStr)
    .gte("total_amount", txn.amount - tolerance)
    .lte("total_amount", txn.amount + tolerance)
    .limit(10);

  const list = candidates || [];

  // Attempt 2: amount + party name in description
  const tokens = list.flatMap((c: any) => {
    const counterparty = txn.transaction_type === "CREDIT" ? c.buyer_name : c.vendor_name;
    return counterparty ? [{ id: c.id, tokens: partyNameTokens(counterparty) }] : [];
  });
  for (const t of tokens) {
    if (t.tokens.some((tok) => descLc.includes(tok))) {
      return {
        matched_invoice_id: t.id,
        match_confidence: 0.88,
        matched_by: "AI",
        category: txn.transaction_type === "CREDIT" ? "SALES_RECEIPT" : "PURCHASE_PAYMENT",
        reconciliation_status: "MATCHED",
      };
    }
  }

  // Attempt 1: amount + date (unique candidate)
  if (list.length === 1) {
    return {
      matched_invoice_id: list[0].id,
      match_confidence: 0.95,
      matched_by: "AI",
      category: txn.transaction_type === "CREDIT" ? "SALES_RECEIPT" : "PURCHASE_PAYMENT",
      reconciliation_status: "MATCHED",
    };
  }

  // No match — categorize by keyword
  return {
    matched_invoice_id: null,
    match_confidence: null,
    matched_by: null,
    category: keywordCategory(desc),
    reconciliation_status: "UNMATCHED",
  };
}
