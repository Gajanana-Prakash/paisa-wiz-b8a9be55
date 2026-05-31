import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCAOwner } from "./timetracking.server";
import { SLA_BY_TIER } from "./support.content";
import { deriveSupportTier, logSupportInteraction } from "./support.server";

async function getOwnerFirmId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id")
    .eq("user_id", userId)
    .eq("role", "ca_owner")
    .limit(1)
    .maybeSingle();
  if (!data?.ca_firm_id) throw new Error("CA owner access required");
  return data.ca_firm_id;
}

async function getCaFirmId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id, role")
    .eq("user_id", userId)
    .in("role", ["ca_owner", "ca_staff"])
    .limit(1)
    .maybeSingle();
  if (!data?.ca_firm_id) throw new Error("CA workspace required");
  return { firmId: data.ca_firm_id, isOwner: data.role === "ca_owner" };
}

export const getSupportContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { firmId } = await getCaFirmId(context.userId);

    const { data: firm } = await supabaseAdmin
      .from("ca_firms")
      .select(
        "id, name, support_tier, onboarding_call_done, onboarding_call_scheduled_at, ca_onboarding_wizard_done, firm_city, firm_client_count_band, account_manager_name, account_manager_whatsapp",
      )
      .eq("id", firmId)
      .single();

    if (!firm) throw new Error("Firm not found");

    const tier = await deriveSupportTier(firmId);
    const sla = SLA_BY_TIER[tier];

    return {
      firm,
      tier,
      slaWhatsapp: sla.whatsapp,
      slaDeadline: sla.deadline,
    };
  });

export const logWhatsAppSupportClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subject: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { firmId } = await getCaFirmId(context.userId);
    await logSupportInteraction({
      caFirmId: firmId,
      channel: "WHATSAPP",
      subject: data.subject || "WhatsApp support opened",
    });
    return { ok: true };
  });

export const scheduleOnboardingCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(10)) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const at = new Date(data.scheduledAt).toISOString();

    const { error } = await supabaseAdmin
      .from("ca_firms")
      .update({
        onboarding_call_scheduled_at: at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", firmId);

    if (error) throw new Error(error.message);

    await logSupportInteraction({
      caFirmId: firmId,
      channel: "IN_APP",
      subject: `Onboarding call scheduled for ${at}`,
    });

    return { ok: true, scheduledAt: at };
  });

export const completeCaOnboardingWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmName: z.string().trim().min(2).max(120).optional(),
        firmCity: z.string().max(80).optional(),
        clientCountBand: z.string().max(20).optional(),
        skipCall: z.boolean().optional(),
        scheduledCallAt: z.string().optional(),
        markCallDone: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only firm owners can complete onboarding");

    const patch: Record<string, unknown> = {
      ca_onboarding_wizard_done: true,
      updated_at: new Date().toISOString(),
    };

    if (data.firmName) patch.name = data.firmName;
    if (data.firmCity) patch.firm_city = data.firmCity;
    if (data.clientCountBand) patch.firm_client_count_band = data.clientCountBand;
    if (data.scheduledCallAt) patch.onboarding_call_scheduled_at = new Date(data.scheduledCallAt).toISOString();
    if (data.markCallDone) patch.onboarding_call_done = true;
    if (data.skipCall === false && data.scheduledCallAt) {
      patch.onboarding_call_scheduled_at = new Date(data.scheduledCallAt).toISOString();
    }

    const { error } = await supabaseAdmin.from("ca_firms").update(patch).eq("id", firmId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const markOnboardingCallDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const { error } = await supabaseAdmin
      .from("ca_firms")
      .update({ onboarding_call_done: true, updated_at: new Date().toISOString() })
      .eq("id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
