import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACTIVITY_CATEGORY: Record<string, "STRUCTURED" | "UNSTRUCTURED"> = {
  SEMINAR: "STRUCTURED",
  WEBINAR: "STRUCTURED",
  CONFERENCE: "STRUCTURED",
  ICAI_PROGRAM: "STRUCTURED",
  E_LEARNING: "STRUCTURED",
  STUDY_CIRCLE: "STRUCTURED",
  SELF_READING: "UNSTRUCTURED",
  WRITING: "UNSTRUCTURED",
  TEACHING: "UNSTRUCTURED",
};

export function computeCpeStatus(
  earned: number,
  required: number,
  blockStart: string,
  blockEnd: string,
): "on_track" | "attention" | "at_risk" {
  const now = new Date();
  const start = new Date(blockStart);
  const end = new Date(blockEnd);
  if (now >= end) return earned >= required ? "on_track" : "at_risk";
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const fraction = elapsedMs / totalMs;
  const expectedByNow = required * fraction;
  if (expectedByNow < 1) return "on_track";
  if (earned >= expectedByNow * 0.9) return "on_track";
  if (earned >= expectedByNow * 0.7) return "attention";
  return "at_risk";
}

export function computePaceInfo(
  earned: number,
  required: number,
  blockStart: string,
  blockEnd: string,
) {
  const now = new Date();
  const start = new Date(blockStart);
  const end = new Date(blockEnd);
  const remaining = Math.max(0, required - earned);
  const elapsedMonths = Math.max(
    0.5,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()),
  );
  const monthsLeft = Math.max(
    0.5,
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()),
  );
  const earnedPace = +(earned / elapsedMonths).toFixed(1);
  const requiredPace = +(remaining / monthsLeft).toFixed(1);
  return {
    remaining,
    monthsLeft: Math.round(monthsLeft),
    earnedPace,
    requiredPace,
  };
}

export async function getOrCreateCpeProfile(userId: string, firmId: string) {
  const { data: existing } = await supabaseAdmin
    .from("ca_professional_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("tenant_id", firmId)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabaseAdmin
    .from("ca_professional_profiles")
    .insert({ user_id: userId, tenant_id: firmId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}
