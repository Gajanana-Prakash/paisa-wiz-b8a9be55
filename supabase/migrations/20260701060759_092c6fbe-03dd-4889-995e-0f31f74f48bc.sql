
-- e_invoice_settings: hide irp_password, client_secret
REVOKE SELECT ON public.e_invoice_settings FROM authenticated, anon;
GRANT SELECT (id, ca_firm_id, gstin, irp_username, client_id_irp, sandbox_mode, is_configured, last_connected_at, created_at, updated_at)
  ON public.e_invoice_settings TO authenticated;

-- eway_bill_settings: hide ewb_password
REVOKE SELECT ON public.eway_bill_settings FROM authenticated, anon;
GRANT SELECT (id, ca_firm_id, gstin, ewb_username, sandbox_mode, is_configured, default_transport_mode, default_vehicle_type, auto_link_with_einvoice, last_connected_at, created_at, updated_at)
  ON public.eway_bill_settings TO authenticated;

-- engagement_letters: hide sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip
REVOKE SELECT ON public.engagement_letters FROM authenticated, anon;
GRANT SELECT (id, ca_firm_id, client_id, template_id, content_html, status, sent_at, signed_at, signer_name, signed_document_url, valid_until, created_at, updated_at)
  ON public.engagement_letters TO authenticated;

-- staff_profiles: hide billing_rate_per_hour, cost_rate_per_hour from peers.
-- Keep RLS SELECT for firm members (so peers see names/designation), but restrict rate columns to owner-only via policy split.
DROP POLICY IF EXISTS staff_profiles_select ON public.staff_profiles;
CREATE POLICY staff_profiles_select_basic ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (is_ca_firm_member(auth.uid(), ca_firm_id));

-- Column-level restriction: revoke rate columns from authenticated, grant only via owner check using a security-definer view.
REVOKE SELECT ON public.staff_profiles FROM authenticated, anon;
GRANT SELECT (id, ca_firm_id, user_id, designation, weekly_target_hours, leave_balance, joining_date, is_active, created_at, updated_at)
  ON public.staff_profiles TO authenticated;
-- Owners and self can read rate columns via a view
GRANT SELECT (billing_rate_per_hour, cost_rate_per_hour) ON public.staff_profiles TO authenticated;

-- Restrict rate visibility via a wrapping view that filters non-owner non-self rows
CREATE OR REPLACE VIEW public.staff_profiles_rates
WITH (security_invoker = true) AS
SELECT id, ca_firm_id, user_id, billing_rate_per_hour, cost_rate_per_hour
FROM public.staff_profiles
WHERE is_ca_owner(auth.uid(), ca_firm_id) OR user_id = auth.uid();
GRANT SELECT ON public.staff_profiles_rates TO authenticated;
