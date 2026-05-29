export type LineItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
};

export type ComputedLine = {
  lineSubtotal: number;
  gstAmount: number;
  total: number;
};

export type ComputedInvoice = {
  subtotal: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  isInterState: boolean;
  totalAmount: number;
  lines: ComputedLine[];
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLine(item: LineItemInput): ComputedLine {
  const lineSubtotal = round2(item.quantity * item.unitPrice);
  const gstAmount = round2((lineSubtotal * item.gstRate) / 100);
  return { lineSubtotal, gstAmount, total: round2(lineSubtotal + gstAmount) };
}

export function gstStateCode(gstin: string | null | undefined): string | null {
  const g = (gstin ?? "").trim().toUpperCase();
  if (g.length < 2) return null;
  return g.slice(0, 2);
}

export function isInterStateInvoice(firmGstin: string | null, clientGstin: string | null): boolean {
  const f = gstStateCode(firmGstin);
  const c = gstStateCode(clientGstin);
  if (!f || !c) return false;
  return f !== c;
}

export function computeInvoiceTotals(
  items: LineItemInput[],
  firmGstin: string | null,
  clientGstin: string | null,
): ComputedInvoice {
  const inter = isInterStateInvoice(firmGstin, clientGstin);
  const lines = items.map(computeLine);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineSubtotal, 0));
  const gstAmount = round2(lines.reduce((s, l) => s + l.gstAmount, 0));
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  if (inter) {
    igstAmount = gstAmount;
  } else {
    cgstAmount = round2(gstAmount / 2);
    sgstAmount = round2(gstAmount - cgstAmount);
  }
  return {
    subtotal,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    isInterState: inter,
    totalAmount: round2(subtotal + gstAmount),
    lines,
  };
}

export function deriveInvoiceStatus(
  current: string,
  balanceDue: number,
  amountPaid: number,
  dueDate: string,
  today: string = new Date().toISOString().slice(0, 10),
): string {
  if (current === "CANCELLED") return "CANCELLED";
  if (current === "DRAFT") return "DRAFT";
  if (balanceDue <= 0.01) return "PAID";
  if (amountPaid > 0) {
    if (dueDate < today) return "OVERDUE";
    return "PARTIALLY_PAID";
  }
  if (["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(current) && dueDate < today) return "OVERDUE";
  return current === "DRAFT" ? "DRAFT" : current === "PAID" ? "PAID" : "SENT";
}

export function formatInvoiceNumber(template: string, seq: number, year: number): string {
  return template
    .replace("{YEAR}", String(year))
    .replace("{NUMBER}", String(seq).padStart(4, "0"));
}
