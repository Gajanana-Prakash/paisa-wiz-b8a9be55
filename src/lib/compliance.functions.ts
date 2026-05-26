import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function clampDay(year: number, monthIdx: number, day: number): Date {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  return new Date(year, monthIdx, Math.min(day, last));
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Indian Financial Year for a given date (FY runs Apr 1 → Mar 31). */
function fyFor(date: Date) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    startYear,
    endYear,
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31),
    label: `FY${String(startYear).slice(2)}-${String(endYear).slice(2)}`,
  };
}

/** Quarter (1-4) within the Indian FY. */
function fyQuarter(date: Date) {
  const m = date.getMonth(); // 0..11
  // FY months: Apr(3),May(4),Jun(5)=Q1; Jul(6)..Sep(8)=Q2; Oct(9)..Dec(11)=Q3; Jan(0)..Mar(2)=Q4
  if (m >= 3 && m <= 5) return 1;
  if (m >= 6 && m <= 8) return 2;
  if (m >= 9 && m <= 11) return 3;
  return 4;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type ComplianceType = {
  id: string;
  code: string;
  name: string;
  category: string;
  applies_to: "ALL" | "GST_REGISTERED" | "COMPANIES_ONLY" | "TDS_DEDUCTOR" | "EMPLOYER";
  recurrence: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "EVENT_BASED";
  default_due_day: number;
  default_due_month: number | null;
  is_active: boolean;
};

type ClientProfile = {
  client_id: string;
  ca_firm_id: string;
  is_gst_registered: boolean;
  is_company: boolean;
  is_tds_deductor: boolean;
  has_employees: boolean;
  is_audit_applicable: boolean;
  entity_type: string;
  gst_filing_frequency: "monthly" | "quarterly";
};

function typeApplies(t: ComplianceType, p: ClientProfile): boolean {
  if (!t.is_active) return false;
  // GST monthly vs quarterly filter
  if (t.code === "GSTR_1_M" || t.code === "GSTR_3B_M") {
    return p.is_gst_registered && p.gst_filing_frequency === "monthly";
  }
  if (t.code === "GSTR_1_Q" || t.code === "GSTR_3B_Q") {
    return p.is_gst_registered && p.gst_filing_frequency === "quarterly";
  }
  // Tax audit
  if (t.code === "TAX_AUDIT_3CA_3CB") return p.is_audit_applicable;
  // ITR_COMPANY_AUDIT also for audit cases
  if (t.code === "ITR_COMPANY_AUDIT") return p.is_company || p.is_audit_applicable;
  switch (t.applies_to) {
    case "ALL": return true;
    case "GST_REGISTERED": return p.is_gst_registered;
    case "COMPANIES_ONLY": return p.is_company;
    case "TDS_DEDUCTOR": return p.is_tds_deductor;
    case "EMPLOYER": return p.has_employees;
    default: return false;
  }
}

/** Build the list of (period_label, due_date) to generate for one type. */
function periodsFor(t: ComplianceType, today: Date): Array<{ period: string; due: Date }> {
  const out: Array<{ period: string; due: Date }> = [];
  const fy = fyFor(today);

  if (t.recurrence === "MONTHLY") {
    // From start of previous month through end of FY
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    let cur = new Date(start);
    while (cur <= fy.end) {
      // Period = data month; due = default_due_day of NEXT month
      const periodMonth = cur.getMonth();
      const periodYear = cur.getFullYear();
      const dueMonthIdx = periodMonth + 1;
      const due = clampDay(periodYear, dueMonthIdx, t.default_due_day);
      out.push({
        period: `${MONTH_SHORT[periodMonth]} ${periodYear}`,
        due,
      });
      cur = new Date(periodYear, periodMonth + 1, 1);
    }
    return out;
  }

  if (t.recurrence === "QUARTERLY") {
    // FY Q1: Apr-Jun (due 13 Jul), Q2: Jul-Sep (due 13 Oct), Q3: Oct-Dec (due 13 Jan next), Q4: Jan-Mar (due 13 Apr next)
    const quarters = [
      { q: 1, dueMonth: 6, dueYear: fy.startYear }, // Jul
      { q: 2, dueMonth: 9, dueYear: fy.startYear }, // Oct
      { q: 3, dueMonth: 0, dueYear: fy.endYear   }, // Jan next
      { q: 4, dueMonth: 3, dueYear: fy.endYear   }, // Apr next
    ];
    for (const q of quarters) {
      const due = clampDay(q.dueYear, q.dueMonth, t.default_due_day);
      out.push({ period: `Q${q.q} ${fy.label}`, due });
    }
    return out;
  }

  if (t.recurrence === "ANNUAL") {
    const m = (t.default_due_month ?? 12) - 1; // 1-12 → 0-11
    // Pick the FY whose due date lies inside it
    // Annual deadlines for current FY use the next instance of (month, day) AFTER fy.start
    let year = fy.startYear;
    if (m < 3) year = fy.endYear; // Jan/Feb/Mar fall in second calendar year of FY
    const due = clampDay(year, m, t.default_due_day);
    out.push({ period: fy.label, due });
    return out;
  }

  return out; // EVENT_BASED → no auto-generation
}

async function loadTypes(): Promise<ComplianceType[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_types")
    .select("id, code, name, category, applies_to, recurrence, default_due_day, default_due_month, is_active")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
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

async function regenerate(clientId: string, caFirmId: string) {
  const { data: profile } = await supabaseAdmin
    .from("client_compliance_profile")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!profile) return { inserted: 0 };

  const p = profile as unknown as ClientProfile;
  const types = await loadTypes();
  const applicable = types.filter((t) => typeApplies(t, p));

  const today = new Date();
  const rows: Array<{
    ca_firm_id: string;
    client_id: string;
    compliance_type_id: string;
    due_date: string;
    period_label: string;
  }> = [];

  for (const t of applicable) {
    const periods = periodsFor(t, today);
    for (const { period, due } of periods) {
      rows.push({
        ca_firm_id: caFirmId,
        client_id: clientId,
        compliance_type_id: t.id,
        due_date: toISODate(due),
        period_label: period,
      });
    }
  }

  if (rows.length === 0) return { inserted: 0 };

  const { error } = await supabaseAdmin
    .from("compliance_deadlines")
    .upsert(rows, { onConflict: "client_id,compliance_type_id,period_label", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return { inserted: rows.length };
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

    const result = await regenerate(data.clientId, caFirmId);
    return { ok: true, ...result };
  });

export const regenerateClientDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId } = await assertClientAccess(context.userId, data.clientId);
    return regenerate(data.clientId, caFirmId);
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
