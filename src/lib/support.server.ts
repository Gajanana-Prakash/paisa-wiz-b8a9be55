import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupportTier } from "./support.content";

export async function deriveSupportTier(caFirmId: string): Promise<SupportTier> {
  const { data: firm } = await supabaseAdmin
    .from("ca_firms")
    .select("support_tier")
    .eq("id", caFirmId)
    .maybeSingle();

  if (firm?.support_tier === "BUSINESS" || firm?.support_tier === "PRO") {
    return firm.support_tier as SupportTier;
  }

  const { data: sub } = await supabaseAdmin
    .from("ca_subscriptions")
    .select("plan_type, status")
    .eq("ca_firm_id", caFirmId)
    .maybeSingle();

  if (!sub || sub.status === "CANCELLED") return "FREE";

  const plan = sub.plan_type as string;
  if (plan === "PROFESSIONAL") return "BUSINESS";
  if (["GROWTH", "STARTER", "PER_CLIENT"].includes(plan) && sub.status !== "TRIAL") return "PRO";
  if (plan === "GROWTH" || plan === "PROFESSIONAL") return "PRO";

  return (firm?.support_tier as SupportTier) ?? "FREE";
}

export async function logSupportInteraction(opts: {
  caFirmId: string;
  channel: "WHATSAPP" | "IN_APP" | "EMAIL" | "PHONE";
  subject: string;
  initiatedBy?: "CA_FIRM" | "GSTIFY_TEAM";
}) {
  const { error } = await supabaseAdmin.from("support_interactions").insert({
    ca_firm_id: opts.caFirmId,
    channel: opts.channel,
    initiated_by: opts.initiatedBy ?? "CA_FIRM",
    subject: opts.subject.slice(0, 500),
    status: "OPEN",
  });
  if (error) console.error("support_interactions insert", error.message);
}
