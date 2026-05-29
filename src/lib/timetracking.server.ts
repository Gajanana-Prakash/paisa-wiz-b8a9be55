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

export async function getStaffBillingRate(userId: string, caFirmId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("billing_rate_per_hour")
    .eq("user_id", userId)
    .eq("ca_firm_id", caFirmId)
    .maybeSingle();
  return Number(data?.billing_rate_per_hour ?? 0);
}

export function computeBillableAmount(durationMinutes: number, ratePerHour: number, isBillable: boolean): number {
  if (!isBillable) return 0;
  return Math.round((durationMinutes / 60) * ratePerHour * 100) / 100;
}

/** ISO week start (Monday) for a given date. */
export function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const day = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
