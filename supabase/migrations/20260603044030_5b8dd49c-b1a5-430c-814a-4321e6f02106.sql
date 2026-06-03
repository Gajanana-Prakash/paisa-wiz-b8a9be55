
-- 1) Lock down recompute_onboarding_progress (called from server functions via service role)
REVOKE EXECUTE ON FUNCTION public.recompute_onboarding_progress(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Restrict ca_firm_billing_settings SELECT to firm owner only (bank account, PAN, UPI etc.)
DROP POLICY IF EXISTS ca_billing_settings_select ON public.ca_firm_billing_settings;
CREATE POLICY ca_billing_settings_select ON public.ca_firm_billing_settings
  FOR SELECT TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- 3) Allow clients to read their own CA invoices and items
DROP POLICY IF EXISTS ca_invoices_select ON public.ca_invoices;
CREATE POLICY ca_invoices_select ON public.ca_invoices
  FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.can_access_client(auth.uid(), client_id)
  );

DROP POLICY IF EXISTS ca_invoice_items_select ON public.ca_invoice_items;
CREATE POLICY ca_invoice_items_select ON public.ca_invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ca_invoices i
    WHERE i.id = ca_invoice_items.invoice_id
      AND (
        public.is_ca_firm_member(auth.uid(), i.ca_firm_id)
        OR public.can_access_client(auth.uid(), i.client_id)
      )
  ));

-- 4) Hide engagement-letter signing secrets from authenticated client roles.
--    Signing flow runs through server functions using the service role, which is unaffected.
REVOKE SELECT (sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip)
  ON public.engagement_letters FROM authenticated, anon;
