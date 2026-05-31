CREATE TYPE public.subscription_plan_type AS ENUM (
  'FREE', 'PER_CLIENT', 'STARTER', 'GROWTH', 'PROFESSIONAL'
);
CREATE TYPE public.subscription_billing_cycle AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE public.subscription_status AS ENUM (
  'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'PAUSED'
);

CREATE TABLE public.ca_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL UNIQUE REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  plan_type public.subscription_plan_type NOT NULL DEFAULT 'FREE',
  billing_cycle public.subscription_billing_cycle NOT NULL DEFAULT 'MONTHLY',
  per_client_rate numeric NOT NULL DEFAULT 99,
  active_client_count integer NOT NULL DEFAULT 0,
  base_clients_included integer NOT NULL DEFAULT 3,
  additional_client_rate numeric NOT NULL DEFAULT 0,
  monthly_amount numeric NOT NULL DEFAULT 0,
  annual_discount_percentage integer NOT NULL DEFAULT 17,
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  razorpay_subscription_id text,
  razorpay_customer_id text,
  status public.subscription_status NOT NULL DEFAULT 'TRIAL',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  pending_plan_type public.subscription_plan_type,
  pending_billing_cycle public.subscription_billing_cycle,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ca_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.ca_subscriptions(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  period_label text NOT NULL,
  plan_type public.subscription_plan_type NOT NULL,
  billing_cycle public.subscription_billing_cycle NOT NULL,
  active_clients integer,
  amount numeric NOT NULL,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'PENDING', 'FAILED')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ca_subscriptions_firm ON public.ca_subscriptions(ca_firm_id);
CREATE INDEX idx_ca_subscription_invoices_firm ON public.ca_subscription_invoices(ca_firm_id, issued_at DESC);

GRANT SELECT, UPDATE ON public.ca_subscriptions TO authenticated;
GRANT SELECT ON public.ca_subscription_invoices TO authenticated;
GRANT ALL ON public.ca_subscriptions TO service_role;
GRANT ALL ON public.ca_subscription_invoices TO service_role;

ALTER TABLE public.ca_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ca_sub_select ON public.ca_subscriptions FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_sub_update ON public.ca_subscriptions FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE POLICY ca_sub_inv_select ON public.ca_subscription_invoices FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE TRIGGER trg_ca_subscriptions_updated BEFORE UPDATE ON public.ca_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
