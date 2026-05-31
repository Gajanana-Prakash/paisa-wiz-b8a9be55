
-- =============================================================================
-- Security remediation: RLS tightening, signing secrets isolation, and
-- locking down SECURITY DEFINER functions callable via PostgREST.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. recompute_onboarding_progress: internal only (trigger + service_role)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recompute_onboarding_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_onboarding_progress(COALESCE(NEW.onboarding_id, OLD.onboarding_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_coi_recompute_progress ON public.client_onboarding_items;
CREATE TRIGGER trg_coi_recompute_progress
  AFTER INSERT OR UPDATE OR DELETE ON public.client_onboarding_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recompute_onboarding_progress();

REVOKE EXECUTE ON FUNCTION public.recompute_onboarding_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_onboarding_progress() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. ca_firm_billing_settings: sensitive fields owner-only at RLS layer
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS ca_billing_settings_select ON public.ca_firm_billing_settings;
CREATE POLICY ca_billing_settings_select ON public.ca_firm_billing_settings
  FOR SELECT TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- -----------------------------------------------------------------------------
-- 3. ca_invoices / ca_invoice_items: clients can view their own invoices
-- -----------------------------------------------------------------------------
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
  USING (
    EXISTS (
      SELECT 1 FROM public.ca_invoices i
      WHERE i.id = invoice_id
        AND (
          public.is_ca_firm_member(auth.uid(), i.ca_firm_id)
          OR public.can_access_client(auth.uid(), i.client_id)
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. engagement_letters: move signing secrets to owner-only table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_letter_signing (
  letter_id uuid PRIMARY KEY REFERENCES public.engagement_letters(id) ON DELETE CASCADE,
  sign_token text UNIQUE,
  signature_otp_hash text,
  signature_otp_expires_at timestamptz,
  signer_ip text
);

INSERT INTO public.engagement_letter_signing (letter_id, sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip)
SELECT id, sign_token, signature_otp_hash, signature_otp_expires_at, signer_ip
FROM public.engagement_letters
WHERE sign_token IS NOT NULL
   OR signature_otp_hash IS NOT NULL
   OR signature_otp_expires_at IS NOT NULL
   OR signer_ip IS NOT NULL
ON CONFLICT (letter_id) DO UPDATE SET
  sign_token = EXCLUDED.sign_token,
  signature_otp_hash = EXCLUDED.signature_otp_hash,
  signature_otp_expires_at = EXCLUDED.signature_otp_expires_at,
  signer_ip = EXCLUDED.signer_ip;

ALTER TABLE public.engagement_letters
  DROP COLUMN IF EXISTS sign_token,
  DROP COLUMN IF EXISTS signature_otp_hash,
  DROP COLUMN IF EXISTS signature_otp_expires_at,
  DROP COLUMN IF EXISTS signer_ip;

GRANT SELECT ON public.engagement_letter_signing TO authenticated;
GRANT ALL ON public.engagement_letter_signing TO service_role;
ALTER TABLE public.engagement_letter_signing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS els_select ON public.engagement_letter_signing;
CREATE POLICY els_select ON public.engagement_letter_signing
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engagement_letters el
      WHERE el.id = letter_id
        AND public.is_ca_owner(auth.uid(), el.ca_firm_id)
    )
  );

DROP POLICY IF EXISTS els_write ON public.engagement_letter_signing;
CREATE POLICY els_write ON public.engagement_letter_signing
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engagement_letters el
      WHERE el.id = letter_id
        AND public.is_ca_owner(auth.uid(), el.ca_firm_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.engagement_letters el
      WHERE el.id = letter_id
        AND public.is_ca_owner(auth.uid(), el.ca_firm_id)
    )
  );

DROP POLICY IF EXISTS el_select ON public.engagement_letters;
CREATE POLICY el_select ON public.engagement_letters
  FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.can_access_client(auth.uid(), client_id)
  );

-- -----------------------------------------------------------------------------
-- 5. Re-apply EXECUTE revokes on SECURITY DEFINER helpers (idempotent)
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ca_firm_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ca_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.document_vault_tsv_trigger() FROM PUBLIC, anon, authenticated;
