import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertFirmAccess(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id, role")
    .eq("user_id", userId)
    .in("role", ["ca_owner", "ca_staff"]);
  const r = data?.[0];
  if (!r?.ca_firm_id) throw new Error("Not a CA firm member");
  return r.ca_firm_id as string;
}

export async function isCAOwner(userId: string, caFirmId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("ca_firm_id", caFirmId)
    .eq("role", "ca_owner")
    .maybeSingle();
  return !!data;
}

/** Compute next due_date given a current ISO date and a recurrence rule. */
export function nextDueDate(current: string, rule: string | null | undefined): string {
  const d = new Date(current + "T00:00:00Z");
  const r = (rule || "MONTHLY").toUpperCase();
  if (r === "QUARTERLY") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (r === "ANNUAL" || r === "YEARLY") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function nextPeriodLabel(current: string | null | undefined, rule: string | null | undefined): string | null {
  if (!current) return null;
  // Best-effort: append "(next)". Period labels are free-form so we don't try to parse.
  const r = (rule || "MONTHLY").toUpperCase();
  return `${current} → next ${r.toLowerCase()}`;
}
