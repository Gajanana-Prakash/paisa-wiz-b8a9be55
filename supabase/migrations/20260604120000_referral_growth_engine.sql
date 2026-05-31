-- Referral & growth engine
CREATE TYPE public.referral_type AS ENUM ('CA_FIRM', 'CLIENT');
CREATE TYPE public.referral_reward_type AS ENUM ('SUBSCRIPTION_DISCOUNT', 'CREDIT', 'EXTRA_CLIENTS');
CREATE TYPE public.referral_status AS ENUM ('SENT', 'SIGNED_UP', 'TRIAL', 'CONVERTED', 'EXPIRED');
CREATE TYPE public.platform_credit_type AS ENUM ('REFERRAL', 'PROMOTION', 'SUPPORT', 'OTHER');
CREATE TYPE public.growth_badge_type AS ENUM (
  'EARLY_ADOPTER', 'CHAMPION', 'AMBASSADOR', 'POWER_USER', 'REFERRAL_STAR'
);

CREATE TABLE public.referral_program_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_active boolean NOT NULL DEFAULT true,
  ca_firm_reward_amount numeric NOT NULL DEFAULT 500,
  ca_firm_reward_type public.referral_reward_type NOT NULL DEFAULT 'CREDIT',
  referred_firm_trial_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.referral_program_settings (program_active, ca_firm_reward_amount)
VALUES (true, 500);

CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  code text NOT NULL,
  referral_type public.referral_type NOT NULL,
  times_used integer NOT NULL DEFAULT 0,
  max_uses integer,
  reward_type public.referral_reward_type NOT NULL DEFAULT 'CREDIT',
  reward_value numeric NOT NULL DEFAULT 500,
  reward_duration_months integer,
  is_active boolean NOT NULL DEFAULT true,
  code_customized boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_code_unique UNIQUE (code)
);

CREATE INDEX idx_referral_codes_firm ON public.referral_codes(ca_firm_id, referral_type);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(upper(code));

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  referred_ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE SET NULL,
  referred_email text,
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  referral_type public.referral_type NOT NULL,
  status public.referral_status NOT NULL DEFAULT 'SENT',
  reward_issued boolean NOT NULL DEFAULT false,
  reward_issued_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_ca_firm_id, created_at DESC);
CREATE INDEX idx_referrals_referred_firm ON public.referrals(referred_ca_firm_id);
CREATE INDEX idx_referrals_email ON public.referrals(lower(referred_email));

CREATE TABLE public.platform_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  credit_type public.platform_credit_type NOT NULL DEFAULT 'REFERRAL',
  amount numeric NOT NULL,
  description text,
  expires_at timestamptz,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  used_against_invoice_id uuid REFERENCES public.ca_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_credits_firm ON public.platform_credits(ca_firm_id, is_used, created_at DESC);

CREATE TABLE public.growth_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  badge_type public.growth_badge_type NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  description text,
  CONSTRAINT growth_badges_firm_type_unique UNIQUE (ca_firm_id, badge_type)
);

CREATE INDEX idx_growth_badges_firm ON public.growth_badges(ca_firm_id);

-- Firm growth / referral preferences
ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS show_powered_by_gstify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_notify_on_signup boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'TRIAL'
    CHECK (subscription_status IN ('TRIAL', 'PAID', 'FREE', 'CANCELLED')),
  ADD COLUMN IF NOT EXISTS signup_referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT SELECT ON public.platform_credits TO authenticated;
GRANT SELECT ON public.growth_badges TO authenticated;
GRANT SELECT ON public.referral_program_settings TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
GRANT ALL ON public.referrals TO service_role;
GRANT ALL ON public.platform_credits TO service_role;
GRANT ALL ON public.growth_badges TO service_role;
GRANT ALL ON public.referral_program_settings TO service_role;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_program_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_codes_select ON public.referral_codes FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY referral_codes_update ON public.referral_codes FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE POLICY referrals_select ON public.referrals FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), referrer_ca_firm_id)
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY referrals_insert ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_owner(auth.uid(), referrer_ca_firm_id));

CREATE POLICY platform_credits_select ON public.platform_credits FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY growth_badges_select ON public.growth_badges FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ca_firms f
      WHERE f.id = ca_firm_id AND f.leaderboard_opt_in = true
    )
  );

CREATE POLICY referral_settings_select ON public.referral_program_settings FOR SELECT TO authenticated
  USING (true);
CREATE POLICY referral_settings_update ON public.referral_program_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_referral_codes_updated BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
