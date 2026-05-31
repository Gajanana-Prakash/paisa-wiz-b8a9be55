import { supabaseAdmin } from "@/integrations/supabase/client.server";

const APP_BASE = typeof process !== "undefined" && process.env.VITE_APP_URL
  ? process.env.VITE_APP_URL
  : "https://gstify.in";

export function referralJoinUrl(code: string) {
  return `${APP_BASE}/join?ref=${encodeURIComponent(code)}`;
}

export function slugifyCodeBase(name: string) {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return base.length >= 3 ? base : "GSTIFY";
}

export async function getProgramSettings() {
  const { data } = await supabaseAdmin
    .from("referral_program_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data ?? {
    program_active: true,
    ca_firm_reward_amount: 500,
    ca_firm_reward_type: "CREDIT",
    referred_firm_trial_days: 30,
  };
}

export async function ensureReferralCodes(caFirmId: string, firmName: string) {
  const { data: existing } = await supabaseAdmin
    .from("referral_codes")
    .select("id, referral_type, code")
    .eq("ca_firm_id", caFirmId);

  const types: Array<"CA_FIRM" | "CLIENT"> = ["CA_FIRM", "CLIENT"];
  const settings = await getProgramSettings();
  const reward = Number(settings.ca_firm_reward_amount ?? 500);

  for (const rt of types) {
    if ((existing ?? []).some((e) => e.referral_type === rt)) continue;
    let code = slugifyCodeBase(firmName);
    if (rt === "CLIENT") code = `${code}C`;
    else code = `${code}25`;

    for (let i = 0; i < 20; i++) {
      const tryCode = i === 0 ? code : `${code}${i}`;
      const { error } = await supabaseAdmin.from("referral_codes").insert({
        ca_firm_id: caFirmId,
        code: tryCode,
        referral_type: rt,
        reward_type: settings.ca_firm_reward_type ?? "CREDIT",
        reward_value: reward,
        max_uses: null,
        is_active: true,
      });
      if (!error) break;
    }
  }
}

export async function notifyCaReferral(
  firmId: string,
  opts: { title: string; body?: string; link?: string; userId?: string | null },
) {
  await supabaseAdmin.from("ca_notifications").insert({
    ca_firm_id: firmId,
    user_id: opts.userId ?? null,
    type: "referral",
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? "/ca/grow",
  });
}

export async function awardBadge(
  caFirmId: string,
  badgeType: string,
  description: string,
) {
  const { error } = await supabaseAdmin.from("growth_badges").insert({
    ca_firm_id: caFirmId,
    badge_type: badgeType,
    description,
  });
  if (error && !String(error.message).includes("duplicate")) {
    console.error("awardBadge", error.message);
    return;
  }
  if (!error) {
    await notifyCaReferral(caFirmId, {
      title: "New badge earned!",
      body: description,
      link: "/ca/grow",
    });
  }
}

export async function checkAndAwardBadges(caFirmId: string) {
  const { count: converted } = await supabaseAdmin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_ca_firm_id", caFirmId)
    .eq("referral_type", "CA_FIRM")
    .eq("status", "CONVERTED");

  const n = converted ?? 0;
  if (n >= 5) {
    await awardBadge(caFirmId, "REFERRAL_STAR", "Referred 5+ CA firms to GSTify");
  }
  if (n >= 10) {
    await awardBadge(caFirmId, "AMBASSADOR", "Referred 10+ CA firms to GSTify");
  }

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, status")
    .eq("ca_firm_id", caFirmId);
  const total = (clients ?? []).filter((c) => c.status !== "pending_invite").length;
  const active = (clients ?? []).filter((c) => c.status === "active").length;
  if (total >= 3 && active === total) {
    await awardBadge(caFirmId, "CHAMPION", "100% client adoption on GSTify");
  }

  const { count: firmRank } = await supabaseAdmin
    .from("ca_firms")
    .select("id", { count: "exact", head: true });
  if ((firmRank ?? 0) <= 500) {
    await awardBadge(caFirmId, "EARLY_ADOPTER", "One of the first 500 CA firms on GSTify");
  }
}

export async function issueReferralCredit(
  referrerFirmId: string,
  referralId: string,
  amount: number,
  description: string,
) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  await supabaseAdmin.from("platform_credits").insert({
    ca_firm_id: referrerFirmId,
    credit_type: "REFERRAL",
    amount,
    description,
    expires_at: expires.toISOString(),
    is_used: false,
  });

  await supabaseAdmin
    .from("referrals")
    .update({
      reward_issued: true,
      reward_issued_at: new Date().toISOString(),
      status: "CONVERTED",
      converted_at: new Date().toISOString(),
    })
    .eq("id", referralId);

  await notifyCaReferral(referrerFirmId, {
    title: `₹${amount} GSTify credit earned`,
    body: `${description} Thank you for the referral!`,
    link: "/ca/grow",
  });

  await checkAndAwardBadges(referrerFirmId);
}

/** Called when a new CA firm completes onboarding with a referral code. */
export async function processReferralSignup(opts: {
  referralCode: string;
  newFirmId: string;
  newFirmOwnerUserId: string;
  referredEmail?: string | null;
}) {
  const settings = await getProgramSettings();
  if (!settings.program_active) return null;

  const codeUpper = opts.referralCode.trim().toUpperCase();
  const { data: codeRow } = await supabaseAdmin
    .from("referral_codes")
    .select("*")
    .eq("code", codeUpper)
    .eq("referral_type", "CA_FIRM")
    .eq("is_active", true)
    .maybeSingle();

  if (!codeRow) return null;
  if (codeRow.ca_firm_id === opts.newFirmId) return null;
  if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) return null;
  if (codeRow.max_uses != null && codeRow.times_used >= codeRow.max_uses) return null;

  const { data: referral, error } = await supabaseAdmin
    .from("referrals")
    .insert({
      referrer_ca_firm_id: codeRow.ca_firm_id,
      referred_ca_firm_id: opts.newFirmId,
      referred_email: opts.referredEmail ?? null,
      referral_code_id: codeRow.id,
      referral_type: "CA_FIRM",
      status: "SIGNED_UP",
    })
    .select("id, referrer_ca_firm_id")
    .single();

  if (error || !referral) return null;

  await supabaseAdmin
    .from("referral_codes")
    .update({ times_used: (codeRow.times_used ?? 0) + 1 })
    .eq("id", codeRow.id);

  await supabaseAdmin
    .from("ca_firms")
    .update({
      signup_referral_id: referral.id,
      subscription_status: "TRIAL",
    })
    .eq("id", opts.newFirmId);

  const { data: referrer } = await supabaseAdmin
    .from("ca_firms")
    .select("name, owner_user_id, referral_notify_on_signup")
    .eq("id", codeRow.ca_firm_id)
    .single();

  const { data: newFirm } = await supabaseAdmin
    .from("ca_firms")
    .select("name")
    .eq("id", opts.newFirmId)
    .single();

  if (referrer?.referral_notify_on_signup !== false) {
    const reward = Number(codeRow.reward_value ?? settings.ca_firm_reward_amount);
    await notifyCaReferral(codeRow.ca_firm_id, {
      title: `${newFirm?.name ?? "A CA firm"} signed up using your link`,
      body: `Your ₹${reward} credit will be applied when they subscribe.`,
      userId: referrer?.owner_user_id ?? null,
    });
  }

  return referral;
}

/** Mark referred firm as paid and issue referrer credit. */
export async function processReferralConversion(referredFirmId: string) {
  const { data: firm } = await supabaseAdmin
    .from("ca_firms")
    .select("signup_referral_id, name, subscription_status")
    .eq("id", referredFirmId)
    .single();

  if (!firm?.signup_referral_id) return;
  if (firm.subscription_status === "PAID") return;

  const { data: ref } = await supabaseAdmin
    .from("referrals")
    .select("*, referral_codes(reward_value)")
    .eq("id", firm.signup_referral_id)
    .single();

  if (!ref || ref.reward_issued) return;

  const settings = await getProgramSettings();
  const amount = Number(
    (ref as { referral_codes?: { reward_value?: number } }).referral_codes?.reward_value
    ?? settings.ca_firm_reward_amount
    ?? 500,
  );

  await supabaseAdmin
    .from("ca_firms")
    .update({ subscription_status: "PAID" })
    .eq("id", referredFirmId);

  await issueReferralCredit(
    ref.referrer_ca_firm_id,
    ref.id,
    amount,
    `Referral — ${firm.name} subscribed`,
  );
}

export async function getUnusedCreditBalance(caFirmId: string) {
  const { data } = await supabaseAdmin
    .from("platform_credits")
    .select("amount, expires_at")
    .eq("ca_firm_id", caFirmId)
    .eq("is_used", false);

  const now = Date.now();
  return (data ?? [])
    .filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now)
    .reduce((s, c) => s + Number(c.amount), 0);
}

export async function applyCreditsToInvoice(caFirmId: string, invoiceId: string, maxApply: number) {
  if (maxApply <= 0) return 0;

  const { data: credits } = await supabaseAdmin
    .from("platform_credits")
    .select("*")
    .eq("ca_firm_id", caFirmId)
    .eq("is_used", false)
    .order("created_at", { ascending: true });

  let remaining = maxApply;
  let applied = 0;
  const now = new Date().toISOString();

  for (const c of credits ?? []) {
    if (remaining <= 0) break;
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) continue;
    const amt = Number(c.amount);
    const use = Math.min(amt, remaining);
    if (use <= 0) continue;

    if (use >= amt) {
      await supabaseAdmin
        .from("platform_credits")
        .update({
          is_used: true,
          used_at: now,
          used_against_invoice_id: invoiceId,
        })
        .eq("id", c.id);
    } else {
      await supabaseAdmin
        .from("platform_credits")
        .update({ amount: amt - use })
        .eq("id", c.id);
      await supabaseAdmin.from("platform_credits").insert({
        ca_firm_id: caFirmId,
        credit_type: c.credit_type,
        amount: use,
        description: `${c.description ?? "Credit"} (applied)`,
        is_used: true,
        used_at: now,
        used_against_invoice_id: invoiceId,
      });
    }
    applied += use;
    remaining -= use;
  }

  return applied;
}
