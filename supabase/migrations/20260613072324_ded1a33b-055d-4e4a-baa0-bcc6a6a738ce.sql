-- 1) eway_bill_settings: revoke column-level SELECT on EWB password from authenticated/anon
REVOKE SELECT (ewb_password) ON public.eway_bill_settings FROM authenticated;
REVOKE SELECT (ewb_password) ON public.eway_bill_settings FROM anon;

-- 2) engagement_letters: restrict UPDATE to ca_owner only (was: any ca firm member, incl. staff)
DROP POLICY IF EXISTS el_update ON public.engagement_letters;
CREATE POLICY el_update ON public.engagement_letters
  FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));