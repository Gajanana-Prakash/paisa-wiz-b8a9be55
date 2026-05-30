
-- Enums
CREATE TYPE public.onboarding_status AS ENUM ('NOT_STARTED','IN_PROGRESS','PENDING_REVIEW','COMPLETED');
CREATE TYPE public.onboarding_item_status AS ENUM ('PENDING','UPLOADED','REVIEWED','APPROVED','REJECTED');
CREATE TYPE public.onboarding_doc_category AS ENUM ('IDENTITY','GST','TAX','BANKING','CORPORATE','OTHER');
CREATE TYPE public.engagement_letter_status AS ENUM ('DRAFT','SENT','SIGNED','EXPIRED');

-- Templates
CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid,
  template_name text NOT NULL,
  entity_type public.entity_type,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ot_select ON public.onboarding_templates FOR SELECT TO authenticated
  USING (is_system = true OR (ca_firm_id IS NOT NULL AND public.is_ca_firm_member(auth.uid(), ca_firm_id)));
CREATE POLICY ot_insert ON public.onboarding_templates FOR INSERT TO authenticated
  WITH CHECK (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);
CREATE POLICY ot_update ON public.onboarding_templates FOR UPDATE TO authenticated
  USING (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);
CREATE POLICY ot_delete ON public.onboarding_templates FOR DELETE TO authenticated
  USING (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);

CREATE TABLE public.onboarding_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  is_mandatory boolean NOT NULL DEFAULT true,
  document_category public.onboarding_doc_category NOT NULL DEFAULT 'OTHER',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oti_template ON public.onboarding_template_items(template_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_template_items TO authenticated;
GRANT ALL ON public.onboarding_template_items TO service_role;
ALTER TABLE public.onboarding_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY oti_select ON public.onboarding_template_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_templates t WHERE t.id = template_id
    AND (t.is_system = true OR (t.ca_firm_id IS NOT NULL AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)))));
CREATE POLICY oti_write ON public.onboarding_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.onboarding_templates t WHERE t.id = template_id
    AND t.ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), t.ca_firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.onboarding_templates t WHERE t.id = template_id
    AND t.ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), t.ca_firm_id)));

-- Client onboarding instances
CREATE TABLE public.client_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL UNIQUE,
  template_id uuid REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
  status public.onboarding_status NOT NULL DEFAULT 'NOT_STARTED',
  completion_percentage integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  completed_at timestamptz,
  engagement_letter_signed boolean NOT NULL DEFAULT false,
  engagement_letter_signed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_onboarding TO authenticated;
GRANT ALL ON public.client_onboarding TO service_role;
ALTER TABLE public.client_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY co_select ON public.client_onboarding FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY co_insert ON public.client_onboarding FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id));
CREATE POLICY co_update ON public.client_onboarding FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY co_delete ON public.client_onboarding FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TABLE public.client_onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.client_onboarding(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES public.onboarding_template_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  description text,
  is_mandatory boolean NOT NULL DEFAULT true,
  document_category public.onboarding_doc_category NOT NULL DEFAULT 'OTHER',
  sort_order integer NOT NULL DEFAULT 0,
  status public.onboarding_item_status NOT NULL DEFAULT 'PENDING',
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coi_onboarding ON public.client_onboarding_items(onboarding_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_onboarding_items TO authenticated;
GRANT ALL ON public.client_onboarding_items TO service_role;
ALTER TABLE public.client_onboarding_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY coi_select ON public.client_onboarding_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_onboarding o WHERE o.id = onboarding_id
    AND public.can_access_client(auth.uid(), o.client_id)));
CREATE POLICY coi_write ON public.client_onboarding_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_onboarding o WHERE o.id = onboarding_id
    AND (public.is_ca_firm_member(auth.uid(), o.ca_firm_id) OR public.can_access_client(auth.uid(), o.client_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_onboarding o WHERE o.id = onboarding_id
    AND (public.is_ca_firm_member(auth.uid(), o.ca_firm_id) OR public.can_access_client(auth.uid(), o.client_id))));

-- Engagement letter templates
CREATE TABLE public.engagement_letter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  name text NOT NULL,
  content_html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_letter_templates TO authenticated;
GRANT ALL ON public.engagement_letter_templates TO service_role;
ALTER TABLE public.engagement_letter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY elt_select ON public.engagement_letter_templates FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY elt_write ON public.engagement_letter_templates FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

-- Engagement letters
CREATE TABLE public.engagement_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  template_id uuid REFERENCES public.engagement_letter_templates(id) ON DELETE SET NULL,
  content_html text NOT NULL,
  status public.engagement_letter_status NOT NULL DEFAULT 'DRAFT',
  sent_at timestamptz,
  signed_at timestamptz,
  signature_otp_hash text,
  signature_otp_expires_at timestamptz,
  signer_name text,
  signer_ip text,
  signed_document_url text,
  valid_until date,
  sign_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_el_client ON public.engagement_letters(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_letters TO authenticated;
GRANT ALL ON public.engagement_letters TO service_role;
ALTER TABLE public.engagement_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY el_select ON public.engagement_letters FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY el_insert ON public.engagement_letters FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY el_update ON public.engagement_letters FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY el_delete ON public.engagement_letters FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- Updated_at triggers
CREATE TRIGGER trg_ot_updated_at BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_co_updated_at BEFORE UPDATE ON public.client_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_coi_updated_at BEFORE UPDATE ON public.client_onboarding_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_elt_updated_at BEFORE UPDATE ON public.engagement_letter_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_el_updated_at BEFORE UPDATE ON public.engagement_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed system templates
WITH p AS (
  INSERT INTO public.onboarding_templates (ca_firm_id, template_name, entity_type, description, is_default, is_system)
  VALUES (NULL, 'Proprietorship Onboarding', 'PROPRIETOR', 'Standard KYC checklist for proprietorship firms', true, true)
  RETURNING id
), pl AS (
  INSERT INTO public.onboarding_templates (ca_firm_id, template_name, entity_type, description, is_default, is_system)
  VALUES (NULL, 'Private Limited Onboarding', 'PRIVATE_LTD', 'KYC + corporate documents for Pvt Ltd companies', true, true)
  RETURNING id
)
INSERT INTO public.onboarding_template_items (template_id, item_name, description, is_mandatory, document_category, sort_order)
SELECT id, item_name, description, is_mandatory, document_category::public.onboarding_doc_category, sort_order
FROM p, (VALUES
  ('Owner PAN Card', 'Self-attested copy of the proprietor''s PAN', true, 'IDENTITY', 1),
  ('Owner Aadhaar Card', 'Self-attested copy of the proprietor''s Aadhaar', true, 'IDENTITY', 2),
  ('Passport size photograph', 'Recent colour passport photo of the proprietor', true, 'IDENTITY', 3),
  ('Business PAN (if different)', 'PAN of the business if separate from owner', false, 'IDENTITY', 4),
  ('GST Registration Certificate', 'GST RC if the business is registered', false, 'GST', 5),
  ('Bank account statement (3 months)', 'Last 3 months of business bank account statements', true, 'BANKING', 6),
  ('Business address proof', 'Utility bill / rent agreement / property tax receipt', true, 'IDENTITY', 7),
  ('Previous year ITR', 'Last filed income tax return acknowledgement', false, 'TAX', 8)
) AS t(item_name, description, is_mandatory, document_category, sort_order)
UNION ALL
SELECT id, item_name, description, is_mandatory, document_category::public.onboarding_doc_category, sort_order
FROM pl, (VALUES
  ('Owner/Director PAN Card', 'PAN of all directors', true, 'IDENTITY', 1),
  ('Owner/Director Aadhaar Card', 'Aadhaar of all directors', true, 'IDENTITY', 2),
  ('Passport size photographs', 'Recent colour photos of all directors', true, 'IDENTITY', 3),
  ('Business PAN', 'PAN of the company', true, 'IDENTITY', 4),
  ('Bank account statement (3 months)', 'Last 3 months of company bank statements', true, 'BANKING', 5),
  ('Business address proof', 'Registered office address proof', true, 'IDENTITY', 6),
  ('Certificate of Incorporation', 'CoI issued by MCA', true, 'CORPORATE', 7),
  ('Memorandum of Association (MOA)', 'MOA of the company', true, 'CORPORATE', 8),
  ('Articles of Association (AOA)', 'AOA of the company', true, 'CORPORATE', 9),
  ('Board Resolution', 'Board resolution authorising CA engagement', true, 'CORPORATE', 10),
  ('List of Directors (DIN + PAN)', 'Current list of directors with DIN and PAN', true, 'CORPORATE', 11),
  ('GST Registration Certificate', 'GST RC of the company', true, 'GST', 12),
  ('PF/ESI registration', 'PF / ESI registration certificates if applicable', false, 'CORPORATE', 13),
  ('Previous year financial statements', 'Last year''s audited financials', false, 'TAX', 14),
  ('Previous year ITR-6', 'Last filed ITR-6 acknowledgement', false, 'TAX', 15),
  ('TAN Certificate', 'TAN allotment letter', false, 'TAX', 16)
) AS t(item_name, description, is_mandatory, document_category, sort_order);

-- Helper to recompute completion + status
CREATE OR REPLACE FUNCTION public.recompute_onboarding_progress(_onboarding_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_approved int;
  v_pending_review int;
  v_pct int;
  v_status public.onboarding_status;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status='APPROVED'), COUNT(*) FILTER (WHERE status='UPLOADED')
    INTO v_total, v_approved, v_pending_review
    FROM public.client_onboarding_items WHERE onboarding_id = _onboarding_id;
  IF v_total = 0 THEN v_pct := 0; ELSE v_pct := (v_approved * 100) / v_total; END IF;
  IF v_total > 0 AND v_approved = v_total THEN v_status := 'COMPLETED';
  ELSIF v_pending_review > 0 THEN v_status := 'PENDING_REVIEW';
  ELSIF v_approved > 0 OR v_pending_review > 0 THEN v_status := 'IN_PROGRESS';
  ELSE v_status := 'NOT_STARTED';
  END IF;
  UPDATE public.client_onboarding
    SET completion_percentage = v_pct,
        status = v_status,
        completed_at = CASE WHEN v_status='COMPLETED' AND completed_at IS NULL THEN now() ELSE completed_at END
    WHERE id = _onboarding_id;
END $$;
GRANT EXECUTE ON FUNCTION public.recompute_onboarding_progress(uuid) TO authenticated, service_role;
