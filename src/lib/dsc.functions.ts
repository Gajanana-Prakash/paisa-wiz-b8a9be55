import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import { computeDscStatus, daysUntil } from "./dsc.server";

const DscClass = z.enum(["CLASS_2", "CLASS_3"]);
const DscType = z.enum(["INDIVIDUAL", "ORGANIZATION"]);
const DscStatus = z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "REVOKED"]);
const RenewalStatus = z.enum(["NOT_STARTED", "IN_PROGRESS", "RENEWED"]);

const DscInput = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid().nullable().optional(),
  isFirmOwned: z.boolean().default(false),
  holderName: z.string().trim().min(1).max(200),
  holderDesignation: z.string().max(120).nullable().optional(),
  holderDin: z.string().max(20).nullable().optional(),
  holderPan: z.string().max(12).nullable().optional(),
  dscClass: DscClass,
  dscType: DscType,
  issuingAuthority: z.string().max(80).nullable().optional(),
  serialNumber: z.string().max(120).nullable().optional(),
  issueDate: z.string(),
  expiryDate: z.string(),
  tokenType: z.string().max(120).nullable().optional(),
  tokenPhysicalLocation: z.string().max(200).nullable().optional(),
  usbTokenId: z.string().max(80).nullable().optional(),
  usedFor: z.array(z.string()).default([]),
  notes: z.string().max(2000).nullable().optional(),
  status: DscStatus.optional(),
  renewalStatus: RenewalStatus.optional(),
});

async function enrichRecord(r: any, today: string) {
  const days = daysUntil(r.expiry_date, today);
  const status = computeDscStatus(r.expiry_date, r.status, today);
  return {
    ...r,
    computed_status: status,
    days_remaining: days,
    client_name: r.clients?.business_name ?? (r.client_id ? null : "CA Firm"),
  };
}

export const listDscRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid().optional(),
      status: DscStatus.optional(),
      expiryMonth: z.string().optional(),
      search: z.string().max(100).optional(),
      sortAsc: z.boolean().default(true),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    let q = supabaseAdmin
      .from("dsc_records")
      .select("*, clients(business_name, contact_email, contact_phone)")
      .eq("ca_firm_id", firmId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.expiryMonth) {
      const [y, m] = data.expiryMonth.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const last = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      q = q.gte("expiry_date", from).lte("expiry_date", to);
    }
    q = q.order("expiry_date", { ascending: data.sortAsc });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = await Promise.all((rows ?? []).map((r) => enrichRecord(r, today)));
    if (data.status) list = list.filter((r) => r.computed_status === data.status);
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.holder_name?.toLowerCase().includes(s) ||
          r.clients?.business_name?.toLowerCase().includes(s) ||
          r.serial_number?.toLowerCase().includes(s),
      );
    }
    return list;
  });

export const getDscRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await supabaseAdmin
      .from("dsc_records")
      .select("*, clients(business_name, contact_name, contact_email, contact_phone)")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("DSC record not found");

    const { data: history } = await supabaseAdmin
      .from("dsc_renewal_history")
      .select("*")
      .eq("dsc_record_id", data.id)
      .order("renewed_at", { ascending: false });

    const renewerIds = Array.from(new Set((history ?? []).map((h) => h.renewed_by)));
    let nameMap = new Map<string, string>();
    if (renewerIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", renewerIds);
      nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name as string]));
    }

    return {
      record: await enrichRecord(row, today),
      history: (history ?? []).map((h) => ({ ...h, renewed_by_name: nameMap.get(h.renewed_by) ?? "Staff" })),
    };
  });

export const saveDscRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DscInput.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const clientId = data.isFirmOwned ? null : data.clientId ?? null;
    if (!data.isFirmOwned && !clientId) throw new Error("Select a client or mark as firm-owned DSC");
    if (clientId) {
      const { data: c } = await supabaseAdmin.from("clients").select("id").eq("id", clientId).eq("ca_firm_id", firmId).maybeSingle();
      if (!c) throw new Error("Client not found");
    }

    const today = new Date().toISOString().slice(0, 10);
    const status = data.status ?? computeDscStatus(data.expiryDate, "ACTIVE", today);

    const row = {
      ca_firm_id: firmId,
      client_id: clientId,
      holder_name: data.holderName,
      holder_designation: data.holderDesignation ?? null,
      holder_din: data.holderDin ?? null,
      holder_pan: data.holderPan ?? null,
      dsc_class: data.dscClass,
      dsc_type: data.dscType,
      issuing_authority: data.issuingAuthority ?? null,
      serial_number: data.serialNumber ?? null,
      issue_date: data.issueDate,
      expiry_date: data.expiryDate,
      token_type: data.tokenType ?? null,
      token_physical_location: data.tokenPhysicalLocation ?? null,
      usb_token_id: data.usbTokenId ?? null,
      used_for: data.usedFor,
      notes: data.notes ?? null,
      status,
      renewal_status: data.renewalStatus ?? "NOT_STARTED",
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("dsc_records").update(row).eq("id", data.id).eq("ca_firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin.from("dsc_records").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created!.id };
  });

export const markDscRenewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      newExpiryDate: z.string(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("dsc_records")
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!existing) throw new Error("DSC not found");

    const today = new Date().toISOString().slice(0, 10);
    const status = computeDscStatus(data.newExpiryDate, "ACTIVE", today);

    await supabaseAdmin.from("dsc_renewal_history").insert({
      dsc_record_id: data.id,
      previous_expiry: existing.expiry_date,
      new_expiry: data.newExpiryDate,
      renewed_by: context.userId,
      notes: data.notes ?? null,
    });

    const { error } = await supabaseAdmin
      .from("dsc_records")
      .update({
        expiry_date: data.newExpiryDate,
        status,
        renewal_status: "RENEWED",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeDscRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin
      .from("dsc_records")
      .update({ status: "REVOKED" })
      .eq("id", data.id)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDscRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can delete DSC records");
    const { error } = await supabaseAdmin.from("dsc_records").delete().eq("id", data.id).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDscDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("dsc_records")
      .select("id, expiry_date, status")
      .eq("ca_firm_id", firmId)
      .neq("status", "REVOKED");

    let active = 0;
    let exp30 = 0;
    let exp7 = 0;
    let expired = 0;
    for (const r of rows ?? []) {
      const days = daysUntil(r.expiry_date as string, today);
      const st = computeDscStatus(r.expiry_date as string, r.status as string, today);
      if (st === "EXPIRED") expired += 1;
      else {
        active += 1;
        if (days <= 30) exp30 += 1;
        if (days <= 7 && days >= 0) exp7 += 1;
      }
    }
    return { active, expiring30: exp30, expiring7: exp7, expired };
  });

export const getRenewalAlertPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: row } = await supabaseAdmin
      .from("dsc_records")
      .select("*, clients(business_name, contact_email, contact_phone)")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!row) throw new Error("DSC not found");

    const expiry = new Date(row.expiry_date as string).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const clientName = (row as any).clients?.business_name ?? "your organization";
    const message = `Reminder from your CA: The Digital Signature Certificate (DSC) for ${row.holder_name} (${clientName}) expires on ${expiry}. Please arrange renewal at the earliest. Contact us if you need assistance.`;

    return {
      message,
      email: (row as any).clients?.contact_email ?? null,
      phone: (row as any).clients?.contact_phone ?? null,
      holderName: row.holder_name,
      expiryDate: row.expiry_date,
    };
  });

export const processDscAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("dsc_records")
      .select("id, holder_name, expiry_date, status, client_id, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .neq("status", "REVOKED");

    const { data: owners } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("ca_firm_id", firmId)
      .eq("role", "ca_owner");

    const ownerIds = (owners ?? []).map((o) => o.user_id);
    const notifications: string[] = [];
    const justExpired: string[] = [];

    for (const r of rows ?? []) {
      const days = daysUntil(r.expiry_date as string, today);
      const newStatus = computeDscStatus(r.expiry_date as string, r.status as string, today);
      if (newStatus !== r.status) {
        await supabaseAdmin.from("dsc_records").update({ status: newStatus }).eq("id", r.id);
      }

      const label = `${(r as any).clients?.business_name ?? "Firm"} — ${r.holder_name}`;
      if (days === 60) {
        for (const uid of ownerIds) {
          await supabaseAdmin.from("ca_notifications").insert({
            ca_firm_id: firmId,
            user_id: uid,
            type: "dsc_expiry",
            title: "DSC expiring in 60 days",
            body: label,
            link: "/ca/dsc-vault",
          });
        }
        notifications.push(`60-day: ${label}`);
      }
      if (days === 30) {
        for (const uid of ownerIds) {
          await supabaseAdmin.from("ca_notifications").insert({
            ca_firm_id: firmId,
            user_id: uid,
            type: "dsc_expiry",
            title: "DSC expiring in 30 days",
            body: label,
            link: "/ca/dsc-vault",
          });
        }
        notifications.push(`30-day: ${label}`);
      }
      if (days === 7) {
        for (const uid of ownerIds) {
          await supabaseAdmin.from("ca_notifications").insert({
            ca_firm_id: firmId,
            user_id: uid,
            type: "dsc_expiry_urgent",
            title: "URGENT: DSC expires in 7 days",
            body: label,
            link: "/ca/dsc-vault",
          });
        }
        notifications.push(`7-day: ${label}`);
      }
      if (days === 0 && r.status !== "EXPIRED") {
        justExpired.push(label);
      }
    }

    if (justExpired.length) {
      for (const uid of ownerIds) {
        await supabaseAdmin.from("ca_notifications").insert({
          ca_firm_id: firmId,
          user_id: uid,
          type: "dsc_expired",
          title: `${justExpired.length} DSC(s) expired today`,
          body: justExpired.slice(0, 5).join("; "),
          link: "/ca/dsc-vault",
        });
      }
    }

    return { notificationsCreated: notifications.length + (justExpired.length ? 1 : 0), justExpired };
  });
