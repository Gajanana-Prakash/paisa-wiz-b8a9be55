CREATE TYPE public.support_tier AS ENUM ('FREE', 'PRO', 'BUSINESS');
CREATE TYPE public.support_channel AS ENUM ('WHATSAPP', 'IN_APP', 'EMAIL', 'PHONE');
CREATE TYPE public.support_initiated_by AS ENUM ('CA_FIRM', 'GSTIFY_TEAM');
CREATE TYPE public.support_interaction_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS support_tier public.support_tier NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS onboarding_call_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_call_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ca_onboarding_wizard_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS firm_city text,
  ADD COLUMN IF NOT EXISTS firm_client_count_band text,
  ADD COLUMN IF NOT EXISTS account_manager_name text,
  ADD COLUMN IF NOT EXISTS account_manager_whatsapp text;

CREATE TABLE public.support_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  channel public.support_channel NOT NULL,
  initiated_by public.support_initiated_by NOT NULL DEFAULT 'CA_FIRM',
  subject text NOT NULL DEFAULT '',
  status public.support_interaction_status NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  response_time_minutes integer,
  satisfaction_rating integer CHECK (satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_interactions_firm ON public.support_interactions(ca_firm_id, opened_at DESC);

GRANT SELECT, INSERT ON public.support_interactions TO authenticated;
GRANT ALL ON public.support_interactions TO service_role;

ALTER TABLE public.support_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_interactions_select ON public.support_interactions
  FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY support_interactions_insert ON public.support_interactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND initiated_by = 'CA_FIRM'
  );

CREATE POLICY support_interactions_update ON public.support_interactions
  FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
