-- 1) engagement_letters: revoke column-level SELECT on sensitive fields from authenticated/anon
REVOKE SELECT (sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip)
  ON public.engagement_letters FROM authenticated;
REVOKE SELECT (sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip)
  ON public.engagement_letters FROM anon;

-- 2) e_invoice_settings: revoke column-level SELECT on credentials from authenticated/anon
REVOKE SELECT (irp_password, client_secret)
  ON public.e_invoice_settings FROM authenticated;
REVOKE SELECT (irp_password, client_secret)
  ON public.e_invoice_settings FROM anon;

-- 3) ca_services: split combined write policy so only ca_owner can write
DROP POLICY IF EXISTS ca_services_write ON public.ca_services;
CREATE POLICY ca_services_insert ON public.ca_services
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY ca_services_update ON public.ca_services
  FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY ca_services_delete ON public.ca_services
  FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- 4) document_vault: restrict DELETE to ca_owner
DROP POLICY IF EXISTS dv_delete ON public.document_vault;
CREATE POLICY dv_delete ON public.document_vault
  FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));