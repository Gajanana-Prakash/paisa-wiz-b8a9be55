// Server-only helpers for compliance deadline generation.
// Imported by compliance.functions.ts and tenant.functions.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
function fyFor(date: Date) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    startYear, endYear,
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31),
    label: `FY${String(startYear).slice(2)}-${String(endYear).slice(2)}`,
  };
}
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export type ComplianceType = {
  id: string; code: string; name: string; category: string;
  applies_to: "ALL" | "GST_REGISTERED" | "COMPANIES_ONLY" | "TDS_DEDUCTOR" | "EMPLOYER";
  recurrence: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "EVENT_BASED";
  default_due_day: number; default_due_month: number | null; is_active: boolean;
};
export type ClientProfile = {
  client_id: string; ca_firm_id: string;
  is_gst_registered: boolean; is_company: boolean; is_tds_deductor: boolean;
  has_employees: boolean; is_audit_applicable: boolean;
  entity_type: string;
  gst_filing_frequency: "monthly" | "quarterly";
};

function typeApplies(t: ComplianceType, p: ClientProfile): boolean {
  if (!t.is_active) return false;
  if (t.code === "GSTR_1_M" || t.code === "GSTR_3B_M") return p.is_gst_registered && p.gst_filing_frequency === "monthly";
  if (t.code === "GSTR_1_Q" || t.code === "GSTR_3B_Q") return p.is_gst_registered && p.gst_filing_frequency === "quarterly";
  if (t.code === "TAX_AUDIT_3CA_3CB") return p.is_audit_applicable;
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

function periodsFor(t: ComplianceType, today: Date): Array<{ period: string; due: Date }> {
  const out: Array<{ period: string; due: Date }> = [];
  const fy = fyFor(today);
  if (t.recurrence === "MONTHLY") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    let cur = new Date(start);
    while (cur <= fy.end) {
      const periodMonth = cur.getMonth();
      const periodYear = cur.getFullYear();
      const due = clampDay(periodYear, periodMonth + 1, t.default_due_day);
      out.push({ period: `${MONTH_SHORT[periodMonth]} ${periodYear}`, due });
      cur = new Date(periodYear, periodMonth + 1, 1);
    }
    return out;
  }
  if (t.recurrence === "QUARTERLY") {
    const quarters = [
      { q: 1, dueMonth: 6, dueYear: fy.startYear },
      { q: 2, dueMonth: 9, dueYear: fy.startYear },
      { q: 3, dueMonth: 0, dueYear: fy.endYear },
      { q: 4, dueMonth: 3, dueYear: fy.endYear },
    ];
    for (const q of quarters) {
      const due = clampDay(q.dueYear, q.dueMonth, t.default_due_day);
      out.push({ period: `Q${q.q} ${fy.label}`, due });
    }
    return out;
  }
  if (t.recurrence === "ANNUAL") {
    const m = (t.default_due_month ?? 12) - 1;
    let year = fy.startYear;
    if (m < 3) year = fy.endYear;
    const due = clampDay(year, m, t.default_due_day);
    out.push({ period: fy.label, due });
    return out;
  }
  return out;
}

export async function regenerateDeadlines(clientId: string, caFirmId: string) {
  const { data: profile } = await supabaseAdmin
    .from("client_compliance_profile")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!profile) return { inserted: 0 };

  const p = profile as unknown as ClientProfile;
  const { data: typesRaw } = await supabaseAdmin
    .from("compliance_types")
    .select("id, code, name, category, applies_to, recurrence, default_due_day, default_due_month, is_active")
    .eq("is_active", true);
  const types = (typesRaw ?? []) as unknown as ComplianceType[];
  const applicable = types.filter((t) => typeApplies(t, p));

  const today = new Date();
  const rows: Array<{ ca_firm_id: string; client_id: string; compliance_type_id: string; due_date: string; period_label: string }> = [];
  for (const t of applicable) {
    for (const { period, due } of periodsFor(t, today)) {
      rows.push({
        ca_firm_id: caFirmId, client_id: clientId,
        compliance_type_id: t.id, due_date: toISODate(due), period_label: period,
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

/** Ensure a client has a default (all-false) compliance profile row. Idempotent. */
export async function ensureDefaultComplianceProfile(clientId: string, caFirmId: string) {
  const { data: existing } = await supabaseAdmin
    .from("client_compliance_profile")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing) return { created: false };
  const { error } = await supabaseAdmin.from("client_compliance_profile").insert({
    client_id: clientId, ca_firm_id: caFirmId,
    is_gst_registered: false, is_company: false, is_tds_deductor: false,
    has_employees: false, is_audit_applicable: false,
    entity_type: "PROPRIETOR", gst_filing_frequency: "monthly",
  });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
  return { created: true };
}
