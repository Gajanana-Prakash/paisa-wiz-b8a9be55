import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import {
  ENABLE_EWAY,
  EwbError,
  ewbCancel,
  ewbExtendValidity,
  ewbGenerate,
  ewbTestConnection,
  ewbUpdateVehicle,
  computeValidUntil,
} from "./eway.server";

const hourMs = 60 * 60 * 1000;

// ---------- Settings ----------

export const getEwayBillSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const owner = await isCAOwner(context.userId, firmId);
    if (!owner) {
      const { data } = await supabaseAdmin
        .from("eway_bill_settings")
        .select("is_configured, sandbox_mode, last_connected_at, default_transport_mode, default_vehicle_type, auto_link_with_einvoice")
        .eq("ca_firm_id", firmId)
        .maybeSingle();
      return {
        settings:
          data ?? {
            is_configured: false,
            sandbox_mode: true,
            last_connected_at: null,
            default_transport_mode: "ROAD",
            default_vehicle_type: "REGULAR",
            auto_link_with_einvoice: true,
          },
        canEdit: false,
        mockMode: !ENABLE_EWAY,
      };
    }
    const { data } = await supabaseAdmin
      .from("eway_bill_settings")
      .select("id, gstin, ewb_username, sandbox_mode, is_configured, last_connected_at, default_transport_mode, default_vehicle_type, auto_link_with_einvoice")
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    return {
      settings:
        data ?? {
          id: null,
          gstin: null,
          ewb_username: null,
          sandbox_mode: true,
          is_configured: false,
          last_connected_at: null,
          default_transport_mode: "ROAD" as const,
          default_vehicle_type: "REGULAR" as const,
          auto_link_with_einvoice: true,
        },
      canEdit: true,
      mockMode: !ENABLE_EWAY,
    };
  });

export const saveEwayBillSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        gstin: z.string().trim().max(20).nullable().optional(),
        ewbUsername: z.string().trim().max(120).nullable().optional(),
        ewbPassword: z.string().max(200).nullable().optional(),
        sandboxMode: z.boolean().optional(),
        defaultTransportMode: z.enum(["ROAD", "RAIL", "AIR", "SHIP"]).optional(),
        defaultVehicleType: z.enum(["REGULAR", "OVER_DIMENSIONAL_CARGO"]).optional(),
        autoLinkWithEinvoice: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only firm owners can change e-way bill settings");
    const patch: Record<string, any> = {
      ca_firm_id: firmId,
      gstin: data.gstin ?? null,
      ewb_username: data.ewbUsername ?? null,
      sandbox_mode: data.sandboxMode ?? true,
      default_transport_mode: data.defaultTransportMode ?? "ROAD",
      default_vehicle_type: data.defaultVehicleType ?? "REGULAR",
      auto_link_with_einvoice: data.autoLinkWithEinvoice ?? true,
      is_configured: !!(data.gstin && data.ewbUsername),
    };
    if (data.ewbPassword != null && data.ewbPassword !== "") patch.ewb_password = data.ewbPassword;
    const { error } = await supabaseAdmin.from("eway_bill_settings").upsert(patch, { onConflict: "ca_firm_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testEwayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only firm owners can test the EWB connection");
    const { data } = await supabaseAdmin
      .from("eway_bill_settings")
      .select("gstin, ewb_username, sandbox_mode")
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    const res = await ewbTestConnection({
      gstin: data?.gstin ?? null,
      ewbUsername: data?.ewb_username ?? null,
      sandboxMode: data?.sandbox_mode ?? true,
    });
    if (res.ok) {
      await supabaseAdmin
        .from("eway_bill_settings")
        .update({ last_connected_at: new Date().toISOString() })
        .eq("ca_firm_id", firmId);
    }
    return { ...res, mockMode: !ENABLE_EWAY };
  });

// ---------- Read ----------

function deriveStatus(row: any): "ACTIVE" | "CANCELLED" | "EXPIRED" | "EXTENDED" {
  if (row.ewb_status === "CANCELLED") return "CANCELLED";
  if (row.ewb_valid_until && new Date(row.ewb_valid_until).getTime() < Date.now()) return "EXPIRED";
  return row.ewb_status;
}

export const listClientEwayBills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("eway_bills")
      .select("*")
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .order("ewb_date", { ascending: false, nullsFirst: false });

    const items = (rows ?? []).map((r: any) => {
      const status = deriveStatus(r);
      const validMs = r.ewb_valid_until ? new Date(r.ewb_valid_until).getTime() - Date.now() : null;
      return {
        id: r.id,
        ewbNumber: r.ewb_number,
        ewbDate: r.ewb_date,
        ewbValidUntil: r.ewb_valid_until,
        hoursRemaining: validMs != null ? Math.max(0, Math.round(validMs / hourMs)) : null,
        status,
        documentNumber: r.document_number,
        documentDate: r.document_date,
        fromPlace: r.from_place,
        fromStateCode: r.from_state_code,
        toPlace: r.to_place,
        toStateCode: r.to_state_code,
        transportMode: r.transport_mode,
        vehicleNumber: r.vehicle_number,
        vehicleType: r.vehicle_type,
        distanceKm: r.distance_km,
        totalValue: Number(r.total_value ?? 0),
        extensionCount: r.extension_count,
      };
    });

    const dayMs = 24 * hourMs;
    const summary = {
      active: items.filter((i) => i.status === "ACTIVE" || i.status === "EXTENDED").length,
      expiringToday: items.filter(
        (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24,
      ).length,
      expiringWeek: items.filter(
        (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24 * 7,
      ).length,
      cancelled: items.filter((i) => i.status === "CANCELLED").length,
      expired: items.filter((i) => i.status === "EXPIRED").length,
    };

    const { data: settings } = await supabaseAdmin
      .from("eway_bill_settings")
      .select("sandbox_mode, is_configured, default_transport_mode, default_vehicle_type")
      .eq("ca_firm_id", firmId)
      .maybeSingle();

    return {
      items,
      summary,
      sandboxMode: settings?.sandbox_mode ?? true,
      isConfigured: settings?.is_configured ?? false,
      defaults: {
        transportMode: settings?.default_transport_mode ?? "ROAD",
        vehicleType: settings?.default_vehicle_type ?? "REGULAR",
      },
      mockMode: !ENABLE_EWAY,
    };
  });

export const getEwayBillDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("eway_bills")
      .select("id, client_id, ewb_number, ewb_date, ewb_valid_until, ewb_status, from_place, to_place, vehicle_number, transport_mode, distance_km, total_value, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .order("ewb_date", { ascending: false, nullsFirst: false })
      .limit(200);

    const now = Date.now();
    const items = (rows ?? []).map((r: any) => {
      const status = deriveStatus(r);
      const hours = r.ewb_valid_until ? Math.max(0, Math.round((new Date(r.ewb_valid_until).getTime() - now) / hourMs)) : null;
      return {
        id: r.id,
        clientId: r.client_id,
        clientName: r.clients?.business_name ?? "",
        ewbNumber: r.ewb_number,
        ewbDate: r.ewb_date,
        ewbValidUntil: r.ewb_valid_until,
        hoursRemaining: hours,
        status,
        fromPlace: r.from_place,
        toPlace: r.to_place,
        vehicleNumber: r.vehicle_number,
        transportMode: r.transport_mode,
        distanceKm: r.distance_km,
        totalValue: Number(r.total_value ?? 0),
      };
    });

    const summary = {
      active: items.filter((i) => i.status === "ACTIVE" || i.status === "EXTENDED").length,
      expiringToday: items.filter(
        (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24,
      ).length,
      expiringWeek: items.filter(
        (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24 * 7,
      ).length,
      cancelled: items.filter((i) => i.status === "CANCELLED").length,
    };

    return { items, summary, mockMode: !ENABLE_EWAY };
  });

// ---------- Mutations ----------

const itemSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  hsnCode: z.string().trim().max(12).nullable().optional(),
  quantity: z.number().min(0),
  unit: z.string().trim().max(10).nullable().optional(),
  taxableValue: z.number().min(0),
  cgstRate: z.number().min(0).max(50).default(0),
  sgstRate: z.number().min(0).max(50).default(0),
  igstRate: z.number().min(0).max(50).default(0),
});

const generateSchema = z.object({
  clientId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable().optional(),
  eInvoiceId: z.string().uuid().nullable().optional(),
  supplyType: z.enum(["OUTWARD", "INWARD"]),
  transactionType: z.enum(["REGULAR", "BILL_TO_SHIP_TO", "BILL_FROM_DISPATCH_FROM", "COMBINATION"]).default("REGULAR"),
  documentType: z.enum(["TAX_INVOICE", "BILL_OF_SUPPLY", "CHALLAN", "CREDIT_NOTE", "BILL_OF_ENTRY", "OTHERS"]).default("TAX_INVOICE"),
  documentNumber: z.string().trim().min(1).max(40),
  documentDate: z.string().min(8).max(20),
  fromGstin: z.string().trim().max(20).nullable().optional(),
  fromPlace: z.string().trim().max(120).nullable().optional(),
  fromPincode: z.string().trim().max(10).nullable().optional(),
  fromStateCode: z.string().trim().max(4).nullable().optional(),
  toGstin: z.string().trim().max(20).nullable().optional(),
  toTradeName: z.string().trim().max(200).nullable().optional(),
  toPlace: z.string().trim().max(120).nullable().optional(),
  toPincode: z.string().trim().max(10).nullable().optional(),
  toStateCode: z.string().trim().max(4).nullable().optional(),
  totalValue: z.number().min(0),
  hsnCode: z.string().trim().max(12).nullable().optional(),
  transportMode: z.enum(["ROAD", "RAIL", "AIR", "SHIP"]).default("ROAD"),
  vehicleNumber: z.string().trim().max(20).nullable().optional(),
  vehicleType: z.enum(["REGULAR", "OVER_DIMENSIONAL_CARGO"]).default("REGULAR"),
  transporterName: z.string().trim().max(200).nullable().optional(),
  transporterId: z.string().trim().max(20).nullable().optional(),
  distanceKm: z.number().int().min(1).max(10000),
  items: z.array(itemSchema).min(1).max(100),
});

export const generateEwayBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => generateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    try {
      const res = await ewbGenerate({
        supplyType: data.supplyType,
        transactionType: data.transactionType,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        documentDate: data.documentDate,
        fromGstin: data.fromGstin ?? null,
        fromPlace: data.fromPlace ?? null,
        fromPincode: data.fromPincode ?? null,
        fromStateCode: data.fromStateCode ?? null,
        toGstin: data.toGstin ?? null,
        toTradeName: data.toTradeName ?? null,
        toPlace: data.toPlace ?? null,
        toPincode: data.toPincode ?? null,
        toStateCode: data.toStateCode ?? null,
        totalValue: data.totalValue,
        hsnCode: data.hsnCode ?? null,
        transportMode: data.transportMode,
        vehicleNumber: data.vehicleNumber ?? null,
        vehicleType: data.vehicleType,
        transporterName: data.transporterName ?? null,
        transporterId: data.transporterId ?? null,
        distanceKm: data.distanceKm,
        items: data.items.map((it) => ({
          productName: it.productName,
          hsnCode: it.hsnCode ?? null,
          quantity: it.quantity,
          unit: it.unit ?? null,
          taxableValue: it.taxableValue,
          cgstRate: it.cgstRate,
          sgstRate: it.sgstRate,
          igstRate: it.igstRate,
        })),
      });

      const { data: inserted, error } = await supabaseAdmin
        .from("eway_bills")
        .insert({
          ca_firm_id: firmId,
          client_id: data.clientId,
          invoice_id: data.invoiceId ?? null,
          e_invoice_id: data.eInvoiceId ?? null,
          ewb_number: res.ewbNumber,
          ewb_date: res.ewbDate,
          ewb_valid_until: res.ewbValidUntil,
          ewb_status: "ACTIVE",
          supply_type: data.supplyType,
          transaction_type: data.transactionType,
          document_type: data.documentType,
          document_number: data.documentNumber,
          document_date: data.documentDate,
          from_gstin: data.fromGstin ?? null,
          from_place: data.fromPlace ?? null,
          from_pincode: data.fromPincode ?? null,
          from_state_code: data.fromStateCode ?? null,
          to_gstin: data.toGstin ?? null,
          to_trade_name: data.toTradeName ?? null,
          to_place: data.toPlace ?? null,
          to_pincode: data.toPincode ?? null,
          to_state_code: data.toStateCode ?? null,
          total_value: data.totalValue,
          hsn_code: data.hsnCode ?? null,
          transport_mode: data.transportMode,
          vehicle_number: data.vehicleNumber ?? null,
          vehicle_type: data.vehicleType,
          transporter_name: data.transporterName ?? null,
          transporter_id: data.transporterId ?? null,
          distance_km: data.distanceKm,
          raw_api_response: res.raw,
          generated_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Failed to save e-way bill");

      const itemRows = data.items.map((it) => ({
        eway_bill_id: inserted.id,
        product_name: it.productName,
        hsn_code: it.hsnCode ?? null,
        quantity: it.quantity,
        unit: it.unit ?? null,
        taxable_value: it.taxableValue,
        cgst_rate: it.cgstRate,
        sgst_rate: it.sgstRate,
        igst_rate: it.igstRate,
      }));
      const { error: itErr } = await supabaseAdmin.from("eway_bill_items").insert(itemRows);
      if (itErr) throw new Error(itErr.message);

      return { ok: true as const, id: inserted.id, ewbNumber: res.ewbNumber, validUntil: res.ewbValidUntil };
    } catch (err: any) {
      const code = err instanceof EwbError ? err.code : "UNKNOWN";
      return { ok: false as const, errorCode: code, errorMessage: err?.message ?? "Unknown EWB error" };
    }
  });

export const cancelEwayBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        reasonCode: z.enum(["1", "2", "3", "4"]),
        reasonText: z.string().trim().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("eway_bills")
      .select("id, ewb_number, ewb_date, ewb_status")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!row || !row.ewb_number) throw new Error("E-way bill not found");
    if (row.ewb_status === "CANCELLED") throw new Error("Already cancelled");
    const res = await ewbCancel({
      ewbNumber: row.ewb_number,
      ewbDate: row.ewb_date as unknown as string,
      reasonCode: data.reasonCode,
      reasonText: data.reasonText,
    });
    const { error } = await supabaseAdmin
      .from("eway_bills")
      .update({
        ewb_status: "CANCELLED",
        cancelled_at: res.cancelledAt,
        cancellation_reason: data.reasonText || `Reason ${data.reasonCode}`,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const extendEwayBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        vehicleNumber: z.string().trim().min(1).max(20),
        fromPlace: z.string().trim().min(1).max(120),
        remainingDistance: z.number().int().min(1).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("eway_bills")
      .select("id, ewb_number, vehicle_type, extension_count")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!row || !row.ewb_number) throw new Error("E-way bill not found");
    const res = await ewbExtendValidity({
      ewbNumber: row.ewb_number,
      vehicleNumber: data.vehicleNumber,
      fromPlace: data.fromPlace,
      remainingDistance: data.remainingDistance,
      vehicleType: row.vehicle_type as "REGULAR" | "OVER_DIMENSIONAL_CARGO",
    });
    const { error } = await supabaseAdmin
      .from("eway_bills")
      .update({
        ewb_status: "EXTENDED",
        ewb_valid_until: res.newValidUntil,
        vehicle_number: data.vehicleNumber,
        extension_count: (row.extension_count ?? 0) + 1,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true, newValidUntil: res.newValidUntil };
  });

export const updateEwayVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        vehicleNumber: z.string().trim().min(1).max(20),
        fromPlace: z.string().trim().min(1).max(120),
        reasonCode: z.enum(["1", "2", "3"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("eway_bills")
      .select("id, ewb_number")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!row || !row.ewb_number) throw new Error("E-way bill not found");
    await ewbUpdateVehicle({
      ewbNumber: row.ewb_number,
      vehicleNumber: data.vehicleNumber,
      fromPlace: data.fromPlace,
      reasonCode: data.reasonCode,
    });
    const { error } = await supabaseAdmin
      .from("eway_bills")
      .update({ vehicle_number: data.vehicleNumber })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEwayBill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: ewb } = await supabaseAdmin
      .from("eway_bills")
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!ewb) throw new Error("Not found");
    const { data: items } = await supabaseAdmin
      .from("eway_bill_items")
      .select("*")
      .eq("eway_bill_id", data.id);
    return { ewayBill: ewb, items: items ?? [] };
  });

// Helper used by UI to preview validity for a given distance.
export const previewEwbValidity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        distanceKm: z.number().int().min(0).max(10000),
        vehicleType: z.enum(["REGULAR", "OVER_DIMENSIONAL_CARGO"]).default("REGULAR"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const validUntil = computeValidUntil(Math.max(1, data.distanceKm), data.vehicleType);
    return { validUntil };
  });
