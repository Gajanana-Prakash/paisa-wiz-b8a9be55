import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeInvoiceTotals, deriveInvoiceStatus, round2, type LineItemInput } from "./billing.calc";
import {
  assertFirmAccess,
  isCAOwner,
  allocateInvoiceNumber,
  getOrCreateBillingSettings,
  recalcInvoiceBalances,
} from "./billing.server";

const ServiceUnit = z.enum(["FIXED", "PER_RETURN", "PER_HOUR", "PER_MONTH"]);
const InvoiceStatus = z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]);
const PaymentMode = z.enum(["UPI", "BANK_TRANSFER", "CASH", "CHEQUE", "CARD"]);

const LineItemSchema = z.object({
  serviceId: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().min(0).max(99999),
  unitPrice: z.number().min(0).max(1_000_000_000),
  gstRate: z.number().min(0).max(100),
});

/* ========== SETTINGS ========== */

export const getBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const settings = await getOrCreateBillingSettings(firmId);
    const { data: firm } = await supabaseAdmin.from("ca_firms").select("name, logo_url, primary_color").eq("id", firmId).single();
    return { settings, firm };
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      pan: z.string().max(20).nullable().optional(),
      gstin: z.string().max(20).nullable().optional(),
      firmStateCode: z.string().max(2).nullable().optional(),
      bankName: z.string().max(120).nullable().optional(),
      bankAccount: z.string().max(40).nullable().optional(),
      bankIfsc: z.string().max(20).nullable().optional(),
      accountHolder: z.string().max(120).nullable().optional(),
      upiId: z.string().max(80).nullable().optional(),
      invoiceNumberFormat: z.string().max(80).optional(),
      invoiceNextNumber: z.number().int().min(1).max(999999).optional(),
      defaultPaymentTerms: z.string().max(500).optional(),
      defaultGstRate: z.number().min(0).max(100).optional(),
      signatureUrl: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can update billing settings");
    await getOrCreateBillingSettings(firmId);
    const patch: Record<string, unknown> = {};
    if (data.pan !== undefined) patch.pan = data.pan;
    if (data.gstin !== undefined) patch.gstin = data.gstin;
    if (data.firmStateCode !== undefined) patch.firm_state_code = data.firmStateCode;
    if (data.bankName !== undefined) patch.bank_name = data.bankName;
    if (data.bankAccount !== undefined) patch.bank_account = data.bankAccount;
    if (data.bankIfsc !== undefined) patch.bank_ifsc = data.bankIfsc;
    if (data.accountHolder !== undefined) patch.account_holder = data.accountHolder;
    if (data.upiId !== undefined) patch.upi_id = data.upiId;
    if (data.invoiceNumberFormat !== undefined) patch.invoice_number_format = data.invoiceNumberFormat;
    if (data.invoiceNextNumber !== undefined) patch.invoice_next_number = data.invoiceNextNumber;
    if (data.defaultPaymentTerms !== undefined) patch.default_payment_terms = data.defaultPaymentTerms;
    if (data.defaultGstRate !== undefined) patch.default_gst_rate = data.defaultGstRate;
    if (data.signatureUrl !== undefined) patch.signature_url = data.signatureUrl;
    const { error } = await supabaseAdmin.from("ca_firm_billing_settings").update(patch).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const peekNextInvoiceNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const settings = await getOrCreateBillingSettings(firmId);
    const year = new Date().getFullYear();
    const num = settings.invoice_next_number ?? 1;
    const template = settings.invoice_number_format ?? "INV-{YEAR}-{NUMBER}";
    return {
      invoiceNumber: template.replace("{YEAR}", String(year)).replace("{NUMBER}", String(num).padStart(4, "0")),
    };
  });

/* ========== SERVICES ========== */

export const listCaServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ activeOnly: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin.from("ca_services").select("*").eq("ca_firm_id", firmId).order("service_name");
    if (data.activeOnly) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if ((rows ?? []).length === 0 && !data.activeOnly) {
      const defaults = [
        { service_name: "GSTR-1 Filing", default_amount: 1500, unit: "PER_RETURN" as const },
        { service_name: "GSTR-3B Filing", default_amount: 1500, unit: "PER_RETURN" as const },
        { service_name: "ITR Filing - Salaried", default_amount: 2500, unit: "FIXED" as const },
        { service_name: "Bookkeeping (Monthly)", default_amount: 5000, unit: "PER_MONTH" as const },
      ];
      await supabaseAdmin.from("ca_services").insert(
        defaults.map((d) => ({
          ca_firm_id: firmId,
          service_name: d.service_name,
          default_amount: d.default_amount,
          unit: d.unit,
          hsn_sac_code: "998231",
          gst_rate: 18,
        })),
      );
      const { data: seeded } = await supabaseAdmin.from("ca_services").select("*").eq("ca_firm_id", firmId).order("service_name");
      return seeded ?? [];
    }
    return rows ?? [];
  });

export const upsertCaService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      serviceName: z.string().trim().min(1).max(200),
      description: z.string().max(1000).nullable().optional(),
      defaultAmount: z.number().min(0).max(1_000_000_000),
      unit: ServiceUnit,
      hsnSacCode: z.string().max(20).default("998231"),
      gstRate: z.number().min(0).max(100).default(18),
      isActive: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const row = {
      ca_firm_id: firmId,
      service_name: data.serviceName,
      description: data.description ?? null,
      default_amount: data.defaultAmount,
      unit: data.unit,
      hsn_sac_code: data.hsnSacCode,
      gst_rate: data.gstRate,
      is_active: data.isActive,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("ca_services").update(row).eq("id", data.id).eq("ca_firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin.from("ca_services").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created!.id };
  });

export const deleteCaService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin.from("ca_services").delete().eq("id", data.id).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== INVOICES ========== */

async function loadInvoiceFull(invoiceId: string, firmId: string) {
  const { data: inv, error } = await supabaseAdmin
    .from("ca_invoices")
    .select("*, clients(id, business_name, gstin, contact_name, contact_email, contact_phone)")
    .eq("id", invoiceId)
    .eq("ca_firm_id", firmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return null;
  const [{ data: items }, { data: payments }] = await Promise.all([
    supabaseAdmin.from("ca_invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
    supabaseAdmin.from("ca_payments").select("*").eq("invoice_id", invoiceId).order("payment_date", { ascending: false }),
  ]);
  return { ...inv, items: items ?? [], payments: payments ?? [] };
}

export const listCaInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      status: InvoiceStatus.optional(),
      clientId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().max(100).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin
      .from("ca_invoices")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .order("invoice_date", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.dateFrom) q = q.gte("invoice_date", data.dateFrom);
    if (data.dateTo) q = q.lte("invoice_date", data.dateTo);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    let list = rows ?? [];
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter(
        (r: any) =>
          r.invoice_number?.toLowerCase().includes(s) ||
          r.clients?.business_name?.toLowerCase().includes(s),
      );
    }
    return list;
  });

export const getCaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const inv = await loadInvoiceFull(data.id, firmId);
    if (!inv) throw new Error("Invoice not found");
    const settings = await getOrCreateBillingSettings(firmId);
    const { data: firm } = await supabaseAdmin.from("ca_firms").select("name, logo_url, primary_color").eq("id", firmId).single();
    return { invoice: inv, settings, firm };
  });

export const saveCaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      clientId: z.string().uuid(),
      invoiceNumber: z.string().min(1).max(60),
      invoiceDate: z.string(),
      dueDate: z.string(),
      periodLabel: z.string().max(200).nullable().optional(),
      paymentTerms: z.string().max(500).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      upiLink: z.string().max(500).nullable().optional(),
      items: z.array(LineItemSchema).min(1),
      sendAfterSave: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const settings = await getOrCreateBillingSettings(firmId);
    const { data: client } = await supabaseAdmin.from("clients").select("gstin").eq("id", data.clientId).single();
    const totals = computeInvoiceTotals(
      data.items as LineItemInput[],
      settings.gstin as string | null,
      client?.gstin ?? null,
    );

    const invRow = {
      ca_firm_id: firmId,
      client_id: data.clientId,
      invoice_number: data.invoiceNumber,
      invoice_date: data.invoiceDate,
      due_date: data.dueDate,
      period_label: data.periodLabel ?? null,
      subtotal: totals.subtotal,
      gst_amount: totals.gstAmount,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      is_inter_state: totals.isInterState,
      total_amount: totals.totalAmount,
      balance_due: totals.totalAmount,
      payment_terms: data.paymentTerms ?? settings.default_payment_terms,
      notes: data.notes ?? null,
      upi_link: data.upiLink ?? settings.upi_id ?? null,
      status: data.sendAfterSave ? "SENT" : "DRAFT",
      sent_at: data.sendAfterSave ? new Date().toISOString() : null,
    };

    let invoiceId = data.id;
    if (invoiceId) {
      const { data: existing } = await supabaseAdmin
        .from("ca_invoices")
        .select("status, amount_paid")
        .eq("id", invoiceId)
        .eq("ca_firm_id", firmId)
        .maybeSingle();
      if (!existing) throw new Error("Invoice not found");
      if (existing.status !== "DRAFT") throw new Error("Only draft invoices can be edited");
      const { error } = await supabaseAdmin.from("ca_invoices").update({
        ...invRow,
        balance_due: round2(totals.totalAmount - Number(existing.amount_paid ?? 0)),
      }).eq("id", invoiceId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("ca_invoice_items").delete().eq("invoice_id", invoiceId);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("ca_invoices")
        .insert(invRow)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      invoiceId = created!.id;
    }

    const itemRows = data.items.map((it, idx) => {
      const c = totals.lines[idx];
      return {
        invoice_id: invoiceId!,
        service_id: it.serviceId ?? null,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        gst_rate: it.gstRate,
        gst_amount: c.gstAmount,
        line_subtotal: c.lineSubtotal,
        total: c.total,
        sort_order: idx,
      };
    });
    const { error: iErr } = await supabaseAdmin.from("ca_invoice_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);
    await recalcInvoiceBalances(invoiceId!);
    return { id: invoiceId };
  });

export const sendCaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: inv } = await supabaseAdmin
      .from("ca_invoices")
      .select("status")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "CANCELLED") throw new Error("Cannot send a cancelled invoice");
    const { error } = await supabaseAdmin
      .from("ca_invoices")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin
      .from("ca_invoices")
      .update({ status: "CANCELLED" })
      .eq("id", data.id)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordCaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      invoiceId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000_000),
      paymentDate: z.string(),
      paymentMode: PaymentMode,
      referenceNumber: z.string().max(120).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: inv } = await supabaseAdmin
      .from("ca_invoices")
      .select("balance_due, status")
      .eq("id", data.invoiceId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "CANCELLED" || inv.status === "DRAFT") {
      throw new Error("Cannot record payment on draft or cancelled invoices");
    }
    const { error } = await supabaseAdmin.from("ca_payments").insert({
      invoice_id: data.invoiceId,
      ca_firm_id: firmId,
      amount: data.amount,
      payment_date: data.paymentDate,
      payment_mode: data.paymentMode,
      reference_number: data.referenceNumber ?? null,
      notes: data.notes ?? null,
      recorded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await recalcInvoiceBalances(data.invoiceId);
    return { ok: true };
  });

/* ========== DASHBOARD & REPORTS ========== */

export const getBillingDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const { data: monthInvoices } = await supabaseAdmin
      .from("ca_invoices")
      .select("total_amount, amount_paid, balance_due, status, due_date")
      .eq("ca_firm_id", firmId)
      .gte("invoice_date", monthStart)
      .lte("invoice_date", monthEnd)
      .neq("status", "CANCELLED");

    const invoicedMonth = round2((monthInvoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0));
    const collectedMonth = round2((monthInvoices ?? []).reduce((s, i) => s + Number(i.amount_paid), 0));

    const { data: openInvoices } = await supabaseAdmin
      .from("ca_invoices")
      .select("balance_due, status, due_date")
      .eq("ca_firm_id", firmId)
      .gt("balance_due", 0)
      .not("status", "in", "(DRAFT,CANCELLED,PAID)");

    let outstanding = 0;
    let overdueCount = 0;
    for (const inv of openInvoices ?? []) {
      outstanding += Number(inv.balance_due);
      const st = deriveInvoiceStatus(inv.status as string, Number(inv.balance_due), 0, inv.due_date as string, today);
      if (st === "OVERDUE") overdueCount += 1;
    }

    return {
      invoicedMonth,
      collectedMonth,
      outstanding: round2(outstanding),
      overdueCount,
    };
  });

export const getBillingReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ year: z.number().int().min(2000).max(2100) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const today = new Date().toISOString().slice(0, 10);

    const { data: invoices } = await supabaseAdmin
      .from("ca_invoices")
      .select("invoice_date, total_amount, amount_paid, balance_due, due_date, status, client_id, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .neq("status", "CANCELLED");

    const monthly: Array<{ month: number; invoiced: number; collected: number }> = [];
    for (let m = 0; m < 12; m += 1) monthly.push({ month: m + 1, invoiced: 0, collected: 0 });
    const clientMap = new Map<string, { client_id: string; client_name: string; outstanding: number }>();
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };

    for (const inv of invoices ?? []) {
      const mIdx = new Date(inv.invoice_date as string).getUTCMonth();
      monthly[mIdx].invoiced += Number(inv.total_amount);
      monthly[mIdx].collected += Number(inv.amount_paid);

      const bal = Number(inv.balance_due);
      if (bal > 0 && !["DRAFT", "CANCELLED", "PAID"].includes(inv.status as string)) {
        const cid = inv.client_id as string;
        const name = (inv as any).clients?.business_name ?? "Unknown";
        const cur = clientMap.get(cid) ?? { client_id: cid, client_name: name, outstanding: 0 };
        cur.outstanding += bal;
        clientMap.set(cid, cur);

        const due = new Date(inv.due_date as string);
        const days = Math.floor((Date.now() - due.getTime()) / 86400000);
        if (days <= 30) aging.d0_30 += bal;
        else if (days <= 60) aging.d31_60 += bal;
        else if (days <= 90) aging.d61_90 += bal;
        else aging.d90_plus += bal;
      }
    }

    return {
      monthly: monthly.map((m) => ({ ...m, invoiced: round2(m.invoiced), collected: round2(m.collected) })),
      clientOutstanding: Array.from(clientMap.values())
        .map((c) => ({ ...c, outstanding: round2(c.outstanding) }))
        .sort((a, b) => b.outstanding - a.outstanding),
      aging: {
        d0_30: round2(aging.d0_30),
        d31_60: round2(aging.d31_60),
        d61_90: round2(aging.d61_90),
        d90_plus: round2(aging.d90_plus),
      },
    };
  });

/* ========== AUTOMATION ========== */

export const processBillingAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const { data: open } = await supabaseAdmin
      .from("ca_invoices")
      .select("id, status, due_date, balance_due, amount_paid, invoice_number, reminder_count, clients(business_name, contact_phone, contact_email)")
      .eq("ca_firm_id", firmId)
      .in("status", ["SENT", "PARTIALLY_PAID", "OVERDUE"]);

    const reminders: Array<{
      invoiceId: string;
      invoiceNumber: string;
      clientName: string;
      phone: string | null;
      email: string | null;
      message: string;
      reason: string;
    }> = [];

    for (const inv of open ?? []) {
      const balance = Number(inv.balance_due);
      if (balance <= 0) continue;
      const newStatus = deriveInvoiceStatus(
        inv.status as string,
        balance,
        Number(inv.amount_paid),
        inv.due_date as string,
        todayStr,
      );
      if (newStatus === "OVERDUE" && inv.status !== "OVERDUE") {
        await supabaseAdmin.from("ca_invoices").update({ status: "OVERDUE" }).eq("id", inv.id);
      }

      const client = (inv as any).clients;
      const amt = balance.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
      const msg = `Reminder: Invoice ${inv.invoice_number} for ${client?.business_name ?? "your account"} — balance due ${amt}. Please arrange payment at your earliest.`;

      if (inv.due_date === tomorrowStr) {
        reminders.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number as string,
          clientName: client?.business_name ?? "",
          phone: client?.contact_phone ?? null,
          email: client?.contact_email ?? null,
          message: msg,
          reason: "due_tomorrow",
        });
      } else if (newStatus === "OVERDUE" && (inv.reminder_count ?? 0) < 3) {
        reminders.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number as string,
          clientName: client?.business_name ?? "",
          phone: client?.contact_phone ?? null,
          email: client?.contact_email ?? null,
          message: msg,
          reason: "overdue",
        });
        await supabaseAdmin
          .from("ca_invoices")
          .update({
            reminder_count: (inv.reminder_count ?? 0) + 1,
            last_reminder_at: new Date().toISOString(),
          })
          .eq("id", inv.id);
      }
    }

    return { reminders };
  });

export const listClientRetainers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("ca_client_retainers")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertClientRetainer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000_000),
      dayOfMonth: z.number().int().min(1).max(28).default(1),
      description: z.string().max(200).default("Monthly retainer"),
      isActive: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can manage retainers");
    const { error } = await supabaseAdmin.from("ca_client_retainers").upsert(
      {
        ca_firm_id: firmId,
        client_id: data.clientId,
        amount: data.amount,
        day_of_month: data.dayOfMonth,
        description: data.description,
        is_active: data.isActive,
      },
      { onConflict: "ca_firm_id,client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runRetainerInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can run retainer billing");
    const day = new Date().getUTCDate();
    const { data: retainers } = await supabaseAdmin
      .from("ca_client_retainers")
      .select("*")
      .eq("ca_firm_id", firmId)
      .eq("is_active", true)
      .eq("day_of_month", day);
    const settings = await getOrCreateBillingSettings(firmId);
    const created: string[] = [];
    for (const r of retainers ?? []) {
      const invoiceNumber = await allocateInvoiceNumber(firmId);
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 15);
      const { data: inv, error } = await supabaseAdmin
        .from("ca_invoices")
        .insert({
          ca_firm_id: firmId,
          client_id: r.client_id,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().slice(0, 10),
          due_date: due.toISOString().slice(0, 10),
          period_label: r.description,
          subtotal: Number(r.amount),
          gst_amount: round2((Number(r.amount) * Number(settings.default_gst_rate)) / 100),
          total_amount: round2(Number(r.amount) * (1 + Number(settings.default_gst_rate) / 100)),
          balance_due: round2(Number(r.amount) * (1 + Number(settings.default_gst_rate) / 100)),
          payment_terms: settings.default_payment_terms,
          status: "DRAFT",
        })
        .select("id")
        .single();
      if (!error && inv) {
        await supabaseAdmin.from("ca_invoice_items").insert({
          invoice_id: inv.id,
          description: r.description,
          quantity: 1,
          unit_price: Number(r.amount),
          gst_rate: Number(settings.default_gst_rate),
          gst_amount: round2((Number(r.amount) * Number(settings.default_gst_rate)) / 100),
          line_subtotal: Number(r.amount),
          total: round2(Number(r.amount) * (1 + Number(settings.default_gst_rate) / 100)),
        });
        created.push(inv.id);
      }
    }
    return { createdCount: created.length, invoiceIds: created };
  });
