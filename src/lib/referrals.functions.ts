import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import {
  applyCreditsToInvoice,
  ensureReferralCodes,
  getProgramSettings,
  getUnusedCreditBalance,
  processReferralConversion,
  processReferralSignup,
  referralJoinUrl,
} from "./referrals.server";

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Super admin access required");
}

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

const BADGE_META: Record<string, { emoji: string; title: string; howTo: string }> = {
  EARLY_ADOPTER: { emoji: "🏆", title: "Early Adopter", howTo: "Join among the first 500 CA firms on GSTify" },
  REFERRAL_STAR: { emoji: "⭐", title: "Referral Star", howTo: "Refer 5+ CA firms who subscribe" },
  CHAMPION: { emoji: "👑", title: "Champion", howTo: "Get 100% of your clients actively using the portal" },
  AMBASSADOR: { emoji: "🚀", title: "Ambassador", howTo: "Refer 10+ CA firms who subscribe" },
  POWER_USER: { emoji: "⚡", title: "Power User", howTo: "Complete 500+ filings for your clients" },
};

export const lookupReferralCodePublic = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(2).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const settings = await getProgramSettings();
    if (!settings.program_active) return { ok: false as const };

    const { data: row } = await supabaseAdmin
      .from("referral_codes")
      .select("code, referral_type, ca_firms(name)")
      .eq("code", data.code.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (!row) return { ok: false as const };
    return {
      ok: true as const,
      code: row.code,
      referrerName: (row as { ca_firms?: { name?: string } }).ca_firms?.name ?? "A CA firm",
      trialDays: settings.referred_firm_trial_days ?? 30,
    };
  });

export const getGrowthCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const { data: firm } = await supabaseAdmin
      .from("ca_firms")
      .select("id, name, leaderboard_opt_in")
      .eq("id", firmId)
      .single();

    await ensureReferralCodes(firmId, firm?.name ?? "FIRM");

    const settings = await getProgramSettings();

    const [
      codesRes,
      referralsRes,
      creditsRes,
      badgesRes,
      invitesRes,
      clientsRes,
    ] = await Promise.all([
      supabaseAdmin.from("referral_codes").select("*").eq("ca_firm_id", firmId),
      supabaseAdmin
        .from("referrals")
        .select("*, referral_codes(code)")
        .eq("referrer_ca_firm_id", firmId)
        .eq("referral_type", "CA_FIRM")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("platform_credits")
        .select("*")
        .eq("ca_firm_id", firmId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("growth_badges").select("*").eq("ca_firm_id", firmId),
      supabaseAdmin
        .from("client_invites")
        .select("id, email, created_at, accepted_at, client_id, clients(business_name, status)")
        .eq("ca_firm_id", firmId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("clients")
        .select("id, business_name, status, owner_user_id")
        .eq("ca_firm_id", firmId),
    ]);

    const caCode = (codesRes.data ?? []).find((c) => c.referral_type === "CA_FIRM");
    const rewardAmount = Number(caCode?.reward_value ?? settings.ca_firm_reward_amount ?? 500);
    const joinUrl = caCode ? referralJoinUrl(caCode.code) : "";

    const creditBalance = await getUnusedCreditBalance(firmId);

    const clientRows = clientsRes.data ?? [];
    const activeCount = clientRows.filter((c) => c.status === "active").length;
    const eligible = clientRows.filter((c) => c.status !== "pending_invite").length;
    const adoptionPct = eligible > 0 ? Math.round((activeCount / eligible) * 100) : 0;
    const inactiveClients = clientRows.filter((c) => c.status !== "active");

    const earnedBadges = new Set((badgesRes.data ?? []).map((b) => b.badge_type));
    const allBadgeTypes = Object.keys(BADGE_META);
    const badges = allBadgeTypes.map((t) => ({
      type: t,
      ...BADGE_META[t],
      earned: earnedBadges.has(t),
      awardedAt: (badgesRes.data ?? []).find((b) => b.badge_type === t)?.awarded_at ?? null,
    }));

    let leaderboard: Array<{
      firmName: string;
      referrals: number;
      clients: number;
      filings: number;
    }> = [];

    if (firm?.leaderboard_opt_in) {
      const { data: firms } = await supabaseAdmin
        .from("ca_firms")
        .select("id, name")
        .eq("leaderboard_opt_in", true)
        .limit(50);

      const firmIds = (firms ?? []).map((f) => f.id);
      if (firmIds.length) {
        const [refCounts, clientCounts, filingCounts] = await Promise.all([
          supabaseAdmin
            .from("referrals")
            .select("referrer_ca_firm_id")
            .in("referrer_ca_firm_id", firmIds)
            .eq("status", "CONVERTED"),
          supabaseAdmin.from("clients").select("ca_firm_id, status").in("ca_firm_id", firmIds),
          supabaseAdmin
            .from("compliance_deadlines")
            .select("ca_firm_id, status")
            .in("ca_firm_id", firmIds)
            .eq("status", "COMPLETED"),
        ]);

        const refMap = new Map<string, number>();
        for (const r of refCounts.data ?? []) {
          refMap.set(r.referrer_ca_firm_id, (refMap.get(r.referrer_ca_firm_id) ?? 0) + 1);
        }
        const clientMap = new Map<string, number>();
        for (const c of clientCounts.data ?? []) {
          if (c.status === "active") {
            clientMap.set(c.ca_firm_id, (clientMap.get(c.ca_firm_id) ?? 0) + 1);
          }
        }
        const filingMap = new Map<string, number>();
        for (const f of filingCounts.data ?? []) {
          filingMap.set(f.ca_firm_id, (filingMap.get(f.ca_firm_id) ?? 0) + 1);
        }

        leaderboard = (firms ?? [])
          .map((f) => ({
            firmName: f.name,
            referrals: refMap.get(f.id) ?? 0,
            clients: clientMap.get(f.id) ?? 0,
            filings: filingMap.get(f.id) ?? 0,
          }))
          .sort((a, b) => b.referrals - a.referrals || b.clients - a.clients)
          .slice(0, 20);
      }
    }

    const clientInvites = await Promise.all(
      (invitesRes.data ?? []).map(async (inv) => {
        const client = (inv as { clients?: { business_name?: string; status?: string } }).clients;
        let docsUploaded = 0;
        let lastLogin: string | null = null;
        if (inv.client_id) {
          const { count } = await supabaseAdmin
            .from("document_vault")
            .select("id", { count: "exact", head: true })
            .eq("client_id", inv.client_id);
          docsUploaded = count ?? 0;
        }
        return {
          id: inv.id,
          clientName: client?.business_name ?? "—",
          email: inv.email,
          invitedAt: inv.created_at,
          status: inv.accepted_at ? "Active" : client?.status === "pending_invite" ? "Pending" : "Active",
          docsUploaded,
          lastLogin,
        };
      }),
    );

    return {
      programActive: settings.program_active,
      rewardAmount,
      joinUrl,
      referralCode: caCode?.code ?? "",
      referrals: (referralsRes.data ?? []).map((r) => ({
        id: r.id,
        email: r.referred_email ?? "—",
        date: r.created_at,
        status: r.status,
        reward: r.reward_issued
          ? `₹${rewardAmount} credited`
          : r.status === "CONVERTED"
            ? "Pending"
            : "Pending",
        rewardIssued: r.reward_issued,
      })),
      creditBalance,
      credits: (creditsRes.data ?? []).map((c) => ({
        id: c.id,
        date: c.created_at,
        type: c.credit_type,
        description: c.description,
        amount: Number(c.amount),
        status: c.is_used ? "Used" : "Available",
      })),
      badges,
      clientInvites,
      adoption: { pct: adoptionPct, active: activeCount, total: eligible },
      inactiveClients: inactiveClients.map((c) => ({
        id: c.id,
        name: c.business_name,
        status: c.status,
      })),
      leaderboard,
      leaderboardOptIn: firm?.leaderboard_opt_in ?? false,
    };
  });

export const recordReferralInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ email: z.string().email().max(255) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const { data: code } = await supabaseAdmin
      .from("referral_codes")
      .select("id")
      .eq("ca_firm_id", firmId)
      .eq("referral_type", "CA_FIRM")
      .limit(1)
      .maybeSingle();
    if (!code) throw new Error("Referral code not ready");

    const { error } = await supabaseAdmin.from("referrals").insert({
      referrer_ca_firm_id: firmId,
      referred_email: data.email.toLowerCase(),
      referral_code_id: code.id,
      referral_type: "CA_FIRM",
      status: "SENT",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateReferralPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      leaderboardOptIn: z.boolean().optional(),
      referralNotifyOnSignup: z.boolean().optional(),
      showPoweredByGstify: z.boolean().optional(),
      referralCode: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9]+$/).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);

    const firmPatch: Record<string, unknown> = {};
    if (data.leaderboardOptIn !== undefined) firmPatch.leaderboard_opt_in = data.leaderboardOptIn;
    if (data.referralNotifyOnSignup !== undefined) {
      firmPatch.referral_notify_on_signup = data.referralNotifyOnSignup;
    }
    if (data.showPoweredByGstify !== undefined) {
      firmPatch.show_powered_by_gstify = data.showPoweredByGstify;
    }
    if (Object.keys(firmPatch).length) {
      await supabaseAdmin.from("ca_firms").update(firmPatch).eq("id", firmId);
    }

    if (data.referralCode) {
      const { data: existing } = await supabaseAdmin
        .from("referral_codes")
        .select("id, code_customized")
        .eq("ca_firm_id", firmId)
        .eq("referral_type", "CA_FIRM")
        .single();
      if (existing?.code_customized) {
        throw new Error("Referral code can only be customized once");
      }
      const upper = data.referralCode.toUpperCase();
      const { error } = await supabaseAdmin
        .from("referral_codes")
        .update({ code: upper, code_customized: true })
        .eq("id", existing!.id);
      if (error) throw new Error(error.message.includes("unique") ? "Code already taken" : error.message);
    }

    return { ok: true };
  });

export const getReferralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const { data: firm } = await supabaseAdmin
      .from("ca_firms")
      .select("leaderboard_opt_in, referral_notify_on_signup, show_powered_by_gstify, name")
      .eq("id", firmId)
      .single();
    await ensureReferralCodes(firmId, firm?.name ?? "FIRM");
    const { data: code } = await supabaseAdmin
      .from("referral_codes")
      .select("code, code_customized")
      .eq("ca_firm_id", firmId)
      .eq("referral_type", "CA_FIRM")
      .maybeSingle();
    return { firm, code };
  });

export const getAdminReferralDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);

    const settings = await getProgramSettings();
    const { data: referrals } = await supabaseAdmin
      .from("referrals")
      .select("*, referral_codes(code)")
      .order("created_at", { ascending: false })
      .limit(100);

    const { count: signedUp } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .in("status", ["SIGNED_UP", "TRIAL", "CONVERTED"]);

    const { count: converted } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("status", "CONVERTED");

    const { data: credits } = await supabaseAdmin
      .from("platform_credits")
      .select("*, ca_firms(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      settings,
      referrals: referrals ?? [],
      stats: {
        signedUp: signedUp ?? 0,
        converted: converted ?? 0,
        conversionRate: signedUp ? Math.round(((converted ?? 0) / signedUp) * 100) : 0,
      },
      credits: credits ?? [],
    };
  });

export const updateAdminReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      programActive: z.boolean().optional(),
      caFirmRewardAmount: z.number().positive().optional(),
      referredFirmTrialDays: z.number().int().min(0).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: row } = await supabaseAdmin.from("referral_program_settings").select("id").limit(1).single();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.programActive !== undefined) patch.program_active = data.programActive;
    if (data.caFirmRewardAmount !== undefined) patch.ca_firm_reward_amount = data.caFirmRewardAmount;
    if (data.referredFirmTrialDays !== undefined) patch.referred_firm_trial_days = data.referredFirmTrialDays;
    await supabaseAdmin.from("referral_program_settings").update(patch).eq("id", row!.id);
    return { ok: true };
  });

export const adminIssueCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      caFirmId: z.string().uuid(),
      amount: z.number().positive(),
      description: z.string().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await supabaseAdmin.from("platform_credits").insert({
      ca_firm_id: data.caFirmId,
      credit_type: "SUPPORT",
      amount: data.amount,
      description: data.description,
    });
    return { ok: true };
  });

export const adminMarkFirmPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caFirmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await processReferralConversion(data.caFirmId);
    return { ok: true };
  });

export { processReferralSignup, processReferralConversion, applyCreditsToInvoice };
