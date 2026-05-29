import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeInvoiceTotals,
  deriveInvoiceStatus,
  formatInvoiceNumber,
  round2,
  type LineItemInput,
} from "./billing.calc";

export { assertFirmAccess } from "./timetracking.server";
export { isCAOwner } from "./timetracking.server";
export { computeInvoiceTotals, deriveInvoiceStatus, formatInvoiceNumber, round2 };
export type { LineItemInput };

export async function getOrCreateBillingSettings(caFirmId: string) {
  const { data } = await supabaseAdmin
    .from("ca_firm_billing_settings")
    .select("*")
    .eq("ca_firm_id", caFirmId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabaseAdmin
    .from("ca_firm_billing_settings")
    .insert({ ca_firm_id: caFirmId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created!;
}

export async function allocateInvoiceNumber(caFirmId: string): Promise<string> {
  const settings = await getOrCreateBillingSettings(caFirmId);
  const year = new Date().getFullYear();
  const num = settings.invoice_next_number ?? 1;
  const invoiceNumber = formatInvoiceNumber(
    settings.invoice_number_format ?? "INV-{YEAR}-{NUMBER}",
    num,
    year,
  );
  await supabaseAdmin
    .from("ca_firm_billing_settings")
    .update({ invoice_next_number: num + 1 })
    .eq("ca_firm_id", caFirmId);
  return invoiceNumber;
}

export async function recalcInvoiceBalances(invoiceId: string) {
  const { data: inv } = await supabaseAdmin.from("ca_invoices").select("*").eq("id", invoiceId).single();
  if (!inv) return;
  const { data: payments } = await supabaseAdmin
    .from("ca_payments")
    .select("amount")
    .eq("invoice_id", invoiceId);
  const amountPaid = round2((payments ?? []).reduce((s, p) => s + Number(p.amount), 0));
  const balanceDue = round2(Math.max(0, Number(inv.total_amount) - amountPaid));
  const status = deriveInvoiceStatus(
    inv.status as string,
    balanceDue,
    amountPaid,
    inv.due_date as string,
  );
  const patch: Record<string, unknown> = {
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status,
  };
  if (status === "PAID" && !inv.paid_at) patch.paid_at = new Date().toISOString();
  await supabaseAdmin.from("ca_invoices").update(patch).eq("id", invoiceId);
}
