import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCAOwner } from "./timetracking.server";
import {
  PLAN_CATALOG,
  GSTIFY_GSTIN,
  calculateSubscriptionAmount,
  ensureSubscription,
  formatInr,
  listActiveClientsDetail,
  recommendPlan,
  refreshSubscriptionMetrics,
  type BillingCycle,
  type PlanType,
} from "./subscriptions.server";

const planSchema = z.enum(["FREE", "PER_CLIENT", "STARTER", "GROWTH", "PROFESSIONAL"]);
const cycleSchema = z.enum(["MONTHLY", "ANNUAL"]);

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

function planOrder(p: PlanType): number {
  const order: Record<PlanType, number> = {
    FREE: 0,
    PER_CLIENT: 1,
    STARTER: 2,
    GROWTH: 3,
    PROFESSIONAL: 4,
  };
  return order[p];
}

function baseClientsForPlan(plan: PlanType) {
  if (plan === "FREE") return 3;
  if (plan === "STARTER") return 15;
  if (plan === "GROWTH") return 60;
  if (plan === "PROFESSIONAL") return 999999;
  return 0;
}

export const getPricingComparison = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientCount: z.number().int().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const rec = recommendPlan(data.clientCount);
    return {
      clientCount: data.clientCount,
      crossover: 30,
      rows: [
        {
          plan: "Per Client",
          monthly: rec.perClientMonthly,
          annual: rec.perClientAnnual,
          best: rec.best === "PER_CLIENT",
        },
        {
          plan: "Growth",
          monthly: rec.growthMonthly,
          annual: rec.growthAnnual,
          best: rec.best === "GROWTH",
        },
        {
          plan: "Professional",
          monthly: rec.professionalMonthly,
          annual: PLAN_CATALOG.PROFESSIONAL.annual,
          best: rec.best === "PROFESSIONAL",
        },
      ],
      message: rec.message,
      best: rec.best,
      formatted: {
        perClientMonthly: formatInr(rec.perClientMonthly),
        perClientAnnual: formatInr(rec.perClientAnnual),
        growthMonthly: formatInr(rec.growthMonthly),
        growthAnnual: formatInr(rec.growthAnnual),
        professionalMonthly: formatInr(rec.professionalMonthly),
      },
    };
  });

export const getCaSubscriptionBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const firmId = await getOwnerFirmId(userId);
    const sub = await ensureSubscription(firmId);
    await refreshSubscriptionMetrics(sub.id, firmId);

    const { data: fresh } = await supabaseAdmin
      .from("ca_subscriptions")
      .select("*")
      .eq("ca_firm_id", firmId)
      .single();

    const activeClients = await listActiveClientsDetail(firmId);

    let { data: invoices } = await supabaseAdmin
      .from("ca_subscription_invoices")
      .select("*")
      .eq("ca_firm_id", firmId)
      .order("issued_at", { ascending: false })
      .limit(24);

    if (!invoices?.length && fresh) {
      const gst = Math.round((fresh.monthly_amount || 0) * 0.18);
      const total = (fresh.monthly_amount || 0) + gst;
      const label = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
      const invNum = `GST-SUB-${firmId.slice(0, 8).toUpperCase()}-001`;
      const { data: seeded } = await supabaseAdmin
        .from("ca_subscription_invoices")
        .insert({
          ca_firm_id: firmId,
          subscription_id: fresh.id,
          invoice_number: invNum,
          period_label: label,
          plan_type: fresh.plan_type,
          billing_cycle: fresh.billing_cycle,
          active_clients: fresh.active_client_count,
          amount: fresh.monthly_amount || 0,
          gst_amount: gst,
          total_amount: total,
          status: fresh.status === "TRIAL" ? "PENDING" : "PAID",
        })
        .select("*")
        .single();
      invoices = seeded ? [seeded] : [];
    }

    const plan = fresh!.plan_type as PlanType;
    const cycle = fresh!.billing_cycle as BillingCycle;
    const rate = fresh!.per_client_rate ?? 99;
    const active = fresh!.active_client_count ?? 0;

    let breakdown: string | null = null;
    if (plan === "PER_CLIENT") {
      breakdown = `${active} active clients × ${formatInr(rate)} = ${formatInr(active * rate)}`;
    }

    return {
      subscription: fresh,
      gstin: GSTIFY_GSTIN,
      activeClients,
      invoices: invoices ?? [],
      breakdown,
      catalog: PLAN_CATALOG,
    };
  });

export const changeCaSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planType: planSchema,
        billingCycle: cycleSchema,
        immediate: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const firmId = await getOwnerFirmId(userId);
    if (!(await isCAOwner(userId, firmId))) throw new Error("Only firm owners can change plans");

    const sub = await ensureSubscription(firmId);
    const current = sub.plan_type as PlanType;
    const next = data.planType as PlanType;
    const upgrading = planOrder(next) > planOrder(current);
    const downgrading = planOrder(next) < planOrder(current);

    const baseIncluded = baseClientsForPlan(next);
    const perClientRate = next === "PER_CLIENT" ? PLAN_CATALOG.PER_CLIENT.perClientMonthly : 99;

    if (downgrading && !data.immediate) {
      const { error } = await supabaseAdmin
        .from("ca_subscriptions")
        .update({
          pending_plan_type: next,
          pending_billing_cycle: data.billingCycle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("ca_firms")
        .update({ subscription_status: sub.status === "TRIAL" ? "TRIAL" : "PAID" })
        .eq("id", firmId);
      return {
        ok: true,
        scheduled: true,
        message: `Downgrade to ${PLAN_CATALOG[next as keyof typeof PLAN_CATALOG]?.label ?? next} takes effect on your next billing date.`,
      };
    }

    const active = sub.active_client_count ?? 0;
    const amount = calculateSubscriptionAmount(next, data.billingCycle as BillingCycle, active);

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (data.billingCycle === "ANNUAL" ? 12 : 1));

    const { error } = await supabaseAdmin
      .from("ca_subscriptions")
      .update({
        plan_type: next,
        billing_cycle: data.billingCycle,
        base_clients_included: baseIncluded,
        per_client_rate: perClientRate,
        monthly_amount: amount,
        pending_plan_type: null,
        pending_billing_cycle: null,
        status: next === "FREE" ? "ACTIVE" : sub.status === "CANCELLED" ? "TRIAL" : sub.status,
        current_period_end: periodEnd.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (error) throw new Error(error.message);

    const firmStatus =
      next === "FREE" ? "FREE" : sub.status === "TRIAL" ? "TRIAL" : "PAID";
    await supabaseAdmin.from("ca_firms").update({ subscription_status: firmStatus }).eq("id", firmId);

    await refreshSubscriptionMetrics(sub.id, firmId);

    return {
      ok: true,
      scheduled: false,
      message: upgrading
        ? "Plan upgraded immediately. Prorated charges apply for the rest of this billing period."
        : "Plan updated.",
    };
  });

export const cancelCaSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const sub = await ensureSubscription(firmId);

    const periodEnd = sub.current_period_end || new Date().toISOString().slice(0, 10);

    const { error } = await supabaseAdmin
      .from("ca_subscriptions")
      .update({
        cancel_at_period_end: true,
        pending_plan_type: "FREE",
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      message: `Subscription remains active until ${periodEnd}, then moves to Free Forever.`,
    };
  });
