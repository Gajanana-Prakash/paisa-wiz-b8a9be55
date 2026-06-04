/**
 * Build a Tally-compatible XML voucher file from ca_invoices rows.
 */
type InvoiceRow = {
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  subtotal: number;
  notes?: string | null;
  client_name?: string | null;
  client_gstin?: string | null;
  is_inter_state?: boolean;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const tallyDate = (iso: string) => iso.replace(/-/g, "");

function voucher(inv: InvoiceRow, kind: "Sales" | "Purchase" | "Journal"): string {
  const date = tallyDate(inv.invoice_date);
  const party = inv.client_name ?? "Party";
  const total = Number(inv.total_amount || 0);
  const taxable = Number(inv.subtotal || 0);
  const cgst = Number(inv.cgst_amount || 0);
  const sgst = Number(inv.sgst_amount || 0);
  const igst = Number(inv.igst_amount || 0);
  const ledgerName = kind === "Sales" ? "Sales Account" : kind === "Purchase" ? "Purchase Account" : "Journal";
  const partySign = kind === "Sales" ? "-" : "";
  const otherSign = kind === "Sales" ? "" : "-";

  return `
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="${kind}" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>${kind}</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(inv.invoice_number)}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>
      <NARRATION>${esc(inv.notes ?? `${kind} invoice ${inv.invoice_number}`)}</NARRATION>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(party)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${kind === "Sales" ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
        <AMOUNT>${partySign}${total.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${ledgerName}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${kind === "Sales" ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
        <AMOUNT>${otherSign}${taxable.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      ${cgst > 0 ? `<ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><ISDEEMEDPOSITIVE>${kind === "Sales" ? "No" : "Yes"}</ISDEEMEDPOSITIVE><AMOUNT>${otherSign}${cgst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>` : ""}
      ${sgst > 0 ? `<ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><ISDEEMEDPOSITIVE>${kind === "Sales" ? "No" : "Yes"}</ISDEEMEDPOSITIVE><AMOUNT>${otherSign}${sgst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>` : ""}
      ${igst > 0 ? `<ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><ISDEEMEDPOSITIVE>${kind === "Sales" ? "No" : "Yes"}</ISDEEMEDPOSITIVE><AMOUNT>${otherSign}${igst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>` : ""}
    </VOUCHER>
  </TALLYMESSAGE>`;
}

export function buildTallyVoucherXml(opts: {
  invoices: InvoiceRow[];
  includeSales: boolean;
  includePurchase: boolean;
  includeJournal: boolean;
}): string {
  const parts: string[] = [];
  for (const inv of opts.invoices) {
    if (opts.includeSales) parts.push(voucher(inv, "Sales"));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>${parts.join("\n")}</REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
