import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import {
  ENABLE_EINVOICE,
  IrpError,
  irpCancelIrn,
  irpGenerateIrn,
  irpTestConnection,
  renderQrDataUrl,
  type IrnGenerateInput,
} from "./einvoice.server";

const dayMs = 24 * 60 * 60 * 1000;
const daysUntil = (date: string | null) => {
  if (!date) return null;
  return Math.ceil((new Date(date + "T00:00:00").getTime() - Date.now()) / dayMs);
};

async function loadInvoiceForIrn(invoiceId: string, firmId: string) {
  const { data: inv } = await supabaseAdmin
    .from("ca_invoices")
    .select(
      "id, ca_firm_id, client_id, invoice_number, invoice_date, total_amount, cgst_amount, sgst_amount, igst_amount, clients(business_name, gstin)",
    )
    .eq("id", invoiceId)
    .eq("ca_firm_id", firmId)
    .single();
  if (!inv) throw new Error("Invoice not found");

  const { data: items } = await supabaseAdmin
    .from("ca_invoice_items")
    .select("description, quantity, unit_price, gst_rate, total")
    .eq("invoice_id", invoiceId);

  const { data: settings } = await supabaseAdmin
    .from("e_invoice_settings")
    .select("gstin")
    .eq("ca_firm_id", firmId)
    .maybeSingle();

  return { inv, items: items ?? [], settings };
}

function buildIrpPayload(
  inv: any,
  items: any[],
  supplierGstin: string | null,
): IrnGenerateInput {
  return {
    supplierGstin: supplierGstin || null,
    buyerGstin: (inv.clients as any)?.gstin ?? null,
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.invoice_date,
    totalAmount: Number(inv.total_amount ?? 0),
    cgst: Number(inv.cgst_amount ?? 0),
    sgst: Number(inv.sgst_amount ?? 0),
    igst: Number(inv.igst_amount ?? 0),
    items: items.map((it: any) => ({
      description: it.description,
      quantity: Number(it.quantity ?? 1),
      unitPrice: Number(it.unit_price ?? 0),
      gstRate: Number(it.gst_rate ?? 0),
      total: Number(it.total ?? 0),
    })),
  };
}

// ---------- Settings ----------

export const getEInvoiceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const owner = await isCAOwner(context.userId, firmId);
    if (!owner) {
      // Non-owners get a minimal status only — never the credential fields.
      const { data } = await supabaseAdmin
        .from("e_invoice_settings")
        .select("is_configured, sandbox_mode, last_connected_at")
        .eq("ca_firm_id", firmId)
        .maybeSingle();
      return {
        settings: data ?? { is_configured: false, sandbox_mode: true, last_connected_at: null },
        canEdit: false,
        mockMode: !ENABLE_EINVOICE,
      };
    }
    const { data } = await supabaseAdmin
      .from("e_invoice_settings")
      .select("id, gstin, irp_username, client_id_irp, sandbox_mode, is_configured, last_connected_at")
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    return {
      settings:
        data ?? {
          id: null,
          gstin: null,
          irp_username: null,
          client_id_irp: null,
          sandbox_mode: true,
          is_configured: false,
          last_connected_at: null,
        },
      canEdit: true,
      mockMode: !ENABLE_EINVOICE,
    };
  });

export const saveEInvoiceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        gstin: z.string().trim().max(20).nullable().optional(),
        irpUsername: z.string().trim().max(120).nullable().optional(),
        irpPassword: z.string().max(200).nullable().optional(),
        clientIdIrp: z.string().trim().max(120).nullable().optional(),
        clientSecret: z.string().max(200).nullable().optional(),
        sandboxMode: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only firm owners can change e-invoice settings");

    const patch: Record<string, any> = {
      ca_firm_id: firmId,
      gstin: data.gstin ?? null,
      irp_username: data.irpUsername ?? null,
      client_id_irp: data.clientIdIrp ?? null,
      sandbox_mode: data.sandboxMode ?? true,
      is_configured: !!(data.gstin && data.irpUsername),
    };
    // Only overwrite credential fields when actually provided (avoid blanking on edit).
    if (data.irpPassword != null && data.irpPassword !== "") patch.irp_password = data.irpPassword;
    if (data.clientSecret != null && data.clientSecret !== "") patch.client_secret = data.clientSecret;

    const { error } = await supabaseAdmin
      .from("e_invoice_settings")
      .upsert(patch, { onConflict: "ca_firm_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testIrpConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only firm owners can test the IRP connection");

    const { data } = await supabaseAdmin
      .from("e_invoice_settings")
      .select("gstin, irp_username, client_id_irp, sandbox_mode")
      .eq("ca_firm_id", firmId)
      .maybeSingle();

    const result = await irpTestConnection({
      gstin: data?.gstin ?? null,
      irpUsername: data?.irp_username ?? null,
      clientIdIrp: data?.client_id_irp ?? null,
      sandboxMode: data?.sandbox_mode ?? true,
    });

    if (result.ok) {
      await supabaseAdmin
        .from("e_invoice_settings")
        .update({ last_connected_at: new Date().toISOString() })
        .eq("ca_firm_id", firmId);
    }
    return { ...result, mockMode: !ENABLE_EINVOICE };
  });

// ---------- Register & dashboard ----------

export const listClientEInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    const { data: invoices } = await supabaseAdmin
      .from("ca_invoices")
      .select("id, invoice_number, invoice_date, total_amount, client_id, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .order("invoice_date", { ascending: false });

    const ids = (invoices ?? []).map((i: any) => i.id);
    const { data: rows } = ids.length
      ? await supabaseAdmin
          .from("e_invoices")
          .select("*")
          .in("invoice_id", ids)
      : { data: [] as any[] };
    const byInvoice = new Map<string, any>();
    (rows ?? []).forEach((r: any) => byInvoice.set(r.invoice_id, r));

    const items = (invoices ?? []).map((inv: any) => {
      const r = byInvoice.get(inv.id);
      const status: "PENDING" | "GENERATED" | "CANCELLED" | "FAILED" = r?.irn_status ?? "PENDING";
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        buyerName: inv.clients?.business_name ?? "",
        totalAmount: Number(inv.total_amount ?? 0),
        eInvoiceId: r?.id ?? null,
        irn: r?.irn ?? null,
        ackNumber: r?.ack_number ?? null,
        ackDate: r?.ack_date ?? null,
        status,
        qrCodeData: r?.qr_code_data ?? null,
        uploadDeadline: r?.upload_deadline ?? null,
        daysRemaining: r?.upload_deadline ? daysUntil(r.upload_deadline) : null,
        cancelledAt: r?.cancelled_at ?? null,
      };
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const summary = {
      generated: items.filter(
        (i) => i.status === "GENERATED" && i.ackDate && new Date(i.ackDate) >= startOfMonth,
      ).length,
      pending: items.filter((i) => i.status === "PENDING").length,
      deadlineSoon: items.filter(
        (i) => i.status === "PENDING" && i.daysRemaining != null && i.daysRemaining <= 7,
      ).length,
      cancelled: items.filter(
        (i) => i.status === "CANCELLED" && i.cancelledAt && new Date(i.cancelledAt) >= startOfMonth,
      ).length,
    };

    const { data: settings } = await supabaseAdmin
      .from("e_invoice_settings")
      .select("sandbox_mode, is_configured")
      .eq("ca_firm_id", firmId)
      .maybeSingle();

    return {
      items,
      summary,
      sandboxMode: settings?.sandbox_mode ?? true,
      isConfigured: settings?.is_configured ?? false,
      mockMode: !ENABLE_EINVOICE,
    };
  });

export const getEInvoiceDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const in7 = new Date(now.getTime() + 7 * dayMs).toISOString().slice(0, 10);

    const [{ data: activeRows }, { data: pendingRows }, { data: deadlineRows }, { data: failedRows }] =
      await Promise.all([
        supabaseAdmin
          .from("e_invoices")
          .select("id, client_id, ack_date")
          .eq("ca_firm_id", firmId)
          .eq("irn_status", "GENERATED")
          .gte("ack_date", startOfMonth),
        supabaseAdmin
          .from("e_invoices")
          .select("id, client_id, upload_deadline")
          .eq("ca_firm_id", firmId)
          .eq("irn_status", "PENDING"),
        supabaseAdmin
          .from("e_invoices")
          .select("id, client_id, upload_deadline")
          .eq("ca_firm_id", firmId)
          .eq("irn_status", "PENDING")
          .lte("upload_deadline", in7),
        supabaseAdmin
          .from("e_invoices")
          .select("id, client_id")
          .eq("ca_firm_id", firmId)
          .eq("irn_status", "FAILED"),
      ]);

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, business_name, gstin")
      .eq("ca_firm_id", firmId)
      .order("business_name");

    const tally = (rows: any[] | null, clientId: string) =>
      (rows ?? []).filter((r) => r.client_id === clientId).length;

    const byClient = (clients ?? []).map((c) => ({
      clientId: c.id,
      businessName: c.business_name,
      gstin: c.gstin,
      generated: tally(activeRows, c.id),
      pending: tally(pendingRows, c.id),
      deadlineAlert: tally(deadlineRows, c.id),
    }));

    return {
      summary: {
        active: activeRows?.length ?? 0,
        pending: pendingRows?.length ?? 0,
        deadlineAlert: deadlineRows?.length ?? 0,
        failed: failedRows?.length ?? 0,
      },
      byClient,
      mockMode: !ENABLE_EINVOICE,
    };
  });

// ---------- Mutations: generate / cancel / refresh ----------

export const generateIrnForInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { inv, items, settings } = await loadInvoiceForIrn(data.invoiceId, firmId);
    const payload = buildIrpPayload(inv, items, settings?.gstin ?? null);

    try {
      const res = await irpGenerateIrn(payload);
      const qrPng = await renderQrDataUrl(res.qrCodeData);

      // store QR as a data URL in the column (no extra storage dependency for mock mode)
      const upsert = {
        ca_firm_id: firmId,
        client_id: inv.client_id,
        invoice_id: inv.id,
        irn: res.irn,
        irn_status: "GENERATED" as const,
        ack_number: res.ackNumber,
        ack_date: res.ackDate,
        qr_code_data: res.qrCodeData,
        qr_code_image_url: qrPng,
        signed_invoice_json: res.signedInvoiceJson,
        irp_response_raw: res.raw,
        invoice_date: inv.invoice_date,
        cancellation_reason: null,
        cancelled_at: null,
      };
      const { error } = await supabaseAdmin
        .from("e_invoices")
        .upsert(upsert, { onConflict: "invoice_id" });
      if (error) throw new Error(error.message);

      return { ok: true as const, irn: res.irn, ackNumber: res.ackNumber };
    } catch (err: any) {
      const code = err instanceof IrpError ? err.code : "UNKNOWN";
      const message = err?.message ?? "Unknown IRP error";
      await supabaseAdmin
        .from("e_invoices")
        .upsert(
          {
            ca_firm_id: firmId,
            client_id: inv.client_id,
            invoice_id: inv.id,
            irn_status: "FAILED",
            invoice_date: inv.invoice_date,
            irp_response_raw: { error: { code, message } },
          },
          { onConflict: "invoice_id" },
        );
      return { ok: false as const, errorCode: code, errorMessage: message };
    }
  });

export const bulkGenerateIrns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const results: Array<{ invoiceId: string; ok: boolean; message?: string }> = [];
    for (const id of data.invoiceIds) {
      try {
        const { inv, items, settings } = await loadInvoiceForIrn(id, firmId);
        const res = await irpGenerateIrn(buildIrpPayload(inv, items, settings?.gstin ?? null));
        const qrPng = await renderQrDataUrl(res.qrCodeData);
        await supabaseAdmin.from("e_invoices").upsert(
          {
            ca_firm_id: firmId,
            client_id: inv.client_id,
            invoice_id: inv.id,
            irn: res.irn,
            irn_status: "GENERATED",
            ack_number: res.ackNumber,
            ack_date: res.ackDate,
            qr_code_data: res.qrCodeData,
            qr_code_image_url: qrPng,
            signed_invoice_json: res.signedInvoiceJson,
            irp_response_raw: res.raw,
            invoice_date: inv.invoice_date,
            cancellation_reason: null,
            cancelled_at: null,
          },
          { onConflict: "invoice_id" },
        );
        results.push({ invoiceId: id, ok: true });
      } catch (err: any) {
        results.push({ invoiceId: id, ok: false, message: err?.message ?? "Failed" });
      }
    }
    return { results };
  });

export const cancelIrnForInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        reason: z.enum(["1", "2", "3", "4"]),
        reasonText: z.string().trim().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("e_invoices")
      .select("id, irn, irn_status, ack_date")
      .eq("invoice_id", data.invoiceId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!row || !row.irn) throw new Error("No IRN to cancel");
    if (row.irn_status !== "GENERATED") throw new Error("Only active IRNs can be cancelled");
    if (row.ack_date && Date.now() - new Date(row.ack_date).getTime() > 24 * 60 * 60 * 1000) {
      throw new Error("IRN can only be cancelled within 24 hours of generation");
    }
    const res = await irpCancelIrn({ irn: row.irn, reason: data.reason, reasonText: data.reasonText });
    const { error } = await supabaseAdmin
      .from("e_invoices")
      .update({
        irn_status: "CANCELLED",
        cancelled_at: res.cancelledAt,
        cancellation_reason: data.reasonText || `Reason ${data.reason}`,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEInvoiceForInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("e_invoices")
      .select("*")
      .eq("invoice_id", data.invoiceId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    return { eInvoice: row };
  });
