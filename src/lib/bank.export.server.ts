// Build a 4-tab reconciliation report.

import * as XLSX from "xlsx";

export function buildReconciliationReport(input: {
  statement: any;
  transactions: any[];
  invoiceById: Record<string, any>;
}): Uint8Array {
  const { statement, transactions, invoiceById } = input;
  const wb = XLSX.utils.book_new();

  // Tab 1: all transactions
  const all = transactions.map((t) => ({
    Date: t.transaction_date,
    Description: t.description,
    Type: t.transaction_type,
    Amount: Number(t.amount),
    Balance: t.balance_after,
    Reference: t.reference_number,
    Category: t.category,
    Status: t.reconciliation_status,
    "Matched Invoice": t.matched_invoice_id ? invoiceById[t.matched_invoice_id]?.invoice_number ?? "" : "",
    Confidence: t.match_confidence != null ? `${Math.round(Number(t.match_confidence) * 100)}%` : "",
    Notes: t.notes ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), "All Transactions");

  // Tab 2: matched pairs
  const matched = transactions
    .filter((t) => t.matched_invoice_id)
    .map((t) => {
      const inv = invoiceById[t.matched_invoice_id] || {};
      return {
        "Bank Date": t.transaction_date,
        "Bank Description": t.description,
        "Bank Amount": Number(t.amount),
        "Bank Type": t.transaction_type,
        "Invoice Number": inv.invoice_number,
        "Invoice Date": inv.invoice_date,
        "Invoice Total": inv.total_amount,
        "Party": inv.buyer_name || inv.vendor_name,
        "Confidence": t.match_confidence != null ? `${Math.round(Number(t.match_confidence) * 100)}%` : "",
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matched), "Matched Pairs");

  // Tab 3: unmatched
  const unmatched = transactions
    .filter((t) => t.reconciliation_status === "UNMATCHED")
    .map((t) => ({
      Date: t.transaction_date,
      Description: t.description,
      Type: t.transaction_type,
      Amount: Number(t.amount),
      Category: t.category,
      Reference: t.reference_number,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatched), "Unmatched");

  // Tab 4: summary
  const matchedCount = transactions.filter((t) => t.matched_invoice_id).length;
  const summary = [
    { Field: "Bank", Value: statement.bank_name },
    { Field: "Account (last 4)", Value: statement.account_number },
    { Field: "Period From", Value: statement.statement_period_from },
    { Field: "Period To", Value: statement.statement_period_to },
    { Field: "Opening Balance", Value: statement.opening_balance },
    { Field: "Closing Balance", Value: statement.closing_balance },
    { Field: "Total Credits", Value: statement.total_credits },
    { Field: "Total Debits", Value: statement.total_debits },
    { Field: "Transactions", Value: statement.transaction_count },
    { Field: "Auto-Matched", Value: matchedCount },
    { Field: "Unmatched", Value: statement.unreconciled_count },
    { Field: "Reconciliation Status", Value: statement.reconciliation_status },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}
