import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { regenerateDeadlines } from "@/lib/compliance.server";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function assertFirmAccess(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id, role")
    .eq("user_id", userId)
    .in("role", ["ca_owner", "ca_staff"]);
  const r = data?.[0];
  if (!r?.ca_firm_id) throw new Error("Not a CA firm member");
  return r.ca_firm_id as string;
}

async function assertClientAccess(userId: string, clientId: string): Promise<{ caFirmId: string }> {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, ca_firm_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
  const firmId = await assertFirmAccess(userId);
  if (firmId !== client.ca_firm_id) throw new Error("Forbidden: client belongs to another firm");
  return { caFirmId: client.ca_firm_id as string };
}



/* ------------------------------------------------------------------ */
/* Server functions                                                    */
/* ------------------------------------------------------------------ */

export const listComplianceTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("compliance_types")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClientComplianceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertClientAccess(context.userId, data.clientId);
    const { data: row } = await supabaseAdmin
      .from("client_compliance_profile")
      .select("*")
      .eq("client_id", data.clientId)
      .maybeSingle();
    return row;
  });

export const upsertClientComplianceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      profile: z.object({
        is_gst_registered: z.boolean(),
        is_company: z.boolean(),
        is_tds_deductor: z.boolean(),
        has_employees: z.boolean(),
        is_audit_applicable: z.boolean(),
        entity_type: z.enum(["PROPRIETOR","PARTNERSHIP","LLP","PRIVATE_LTD","PUBLIC_LTD","TRUST"]),
        gst_filing_frequency: z.enum(["monthly","quarterly"]),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { caFirmId } = await assertClientAccess(context.userId, data.clientId);

    const { error } = await supabaseAdmin
      .from("client_compliance_profile")
      .upsert(
        { client_id: data.clientId, ca_firm_id: caFirmId, ...data.profile },
        { onConflict: "client_id" },
      );
    if (error) throw new Error(error.message);

    const result = await regenerateDeadlines(data.clientId, caFirmId);
    return { ok: true, ...result };
  });

export const regenerateClientDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId } = await assertClientAccess(context.userId, data.clientId);
    return regenerateDeadlines(data.clientId, caFirmId);
  });

export const listFirmDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      category: z.string().optional(),
      status: z.string().optional(),
      assignedTo: z.string().optional(),
      clientId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    let q = supabaseAdmin
      .from("compliance_deadlines")
      .select(`
        id, ca_firm_id, client_id, compliance_type_id, due_date, period_label,
        status, assigned_to, completed_at, notes, filing_reference, updated_at,
        clients!inner(id, business_name, gstin),
        compliance_types!inner(id, code, name, category, recurrence)
      `)
      .eq("ca_firm_id", firmId)
      .order("due_date", { ascending: true });

    if (data.from) q = q.gte("due_date", data.from);
    if (data.to) q = q.lte("due_date", data.to);
    if (data.status && data.status !== "ALL") q = q.eq("status", data.status as any);
    if (data.assignedTo && data.assignedTo !== "ALL") q = q.eq("assigned_to", data.assignedTo);
    if (data.clientId) q = q.eq("client_id", data.clientId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = (rows ?? []) as any[];
    if (data.category && data.category !== "ALL") {
      list = list.filter((r) => r.compliance_types?.category === data.category);
    }
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.clients?.business_name || "").toLowerCase().includes(s) ||
          (r.compliance_types?.name || "").toLowerCase().includes(s) ||
          (r.period_label || "").toLowerCase().includes(s),
      );
    }
    return list;
  });

export const getComplianceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = toISODate(new Date());
    const in7 = toISODate(new Date(Date.now() + 7 * 86400000));
    const monthStart = new Date(); monthStart.setDate(1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

    const { data: rows } = await supabaseAdmin
      .from("compliance_deadlines")
      .select("id, due_date, status, completed_at")
      .eq("ca_firm_id", firmId);

    const arr = rows ?? [];
    const monthStartS = toISODate(monthStart);
    const monthEndS = toISODate(monthEnd);

    let overdue = 0, dueThisWeek = 0, dueThisMonth = 0, completedThisMonth = 0;
    for (const r of arr) {
      const isOpen = r.status !== "COMPLETED" && r.status !== "NOT_APPLICABLE";
      if (isOpen && r.due_date < today) overdue++;
      if (isOpen && r.due_date >= today && r.due_date <= in7) dueThisWeek++;
      if (isOpen && r.due_date >= monthStartS && r.due_date <= monthEndS) dueThisMonth++;
      if (r.status === "COMPLETED" && r.completed_at && r.completed_at.slice(0, 10) >= monthStartS && r.completed_at.slice(0, 10) <= monthEndS) {
        completedThisMonth++;
      }
    }
    return { overdue, dueThisWeek, dueThisMonth, completedThisMonth };
  });

export const updateDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        status: z.enum(["PENDING","IN_PROGRESS","COMPLETED","OVERDUE","NOT_APPLICABLE"]).optional(),
        assigned_to: z.string().uuid().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        filing_reference: z.string().max(200).nullable().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const completed_at =
      data.patch.status === "COMPLETED"
        ? new Date().toISOString()
        : data.patch.status
          ? null
          : undefined;
    const { error } = await supabaseAdmin
      .from("compliance_deadlines")
      .update({ ...data.patch, ...(completed_at !== undefined ? { completed_at } : {}) })
      .eq("id", data.id)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUpdateDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      patch: z.object({
        status: z.enum(["PENDING","IN_PROGRESS","COMPLETED","OVERDUE","NOT_APPLICABLE"]).optional(),
        assigned_to: z.string().uuid().nullable().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const completed_at =
      data.patch.status === "COMPLETED"
        ? new Date().toISOString()
        : data.patch.status
          ? null
          : undefined;
    const { error } = await supabaseAdmin
      .from("compliance_deadlines")
      .update({ ...data.patch, ...(completed_at !== undefined ? { completed_at } : {}) })
      .in("id", data.ids)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const listFirmStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("ca_firm_id", firmId)
      .in("role", ["ca_owner", "ca_staff"]);
    const ids = (data ?? []).map((r: any) => r.user_id as string);
    if (ids.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    return (profs ?? []).map((p: any) => ({ id: p.id as string, name: (p.full_name as string) || "Unnamed" }));
  });
