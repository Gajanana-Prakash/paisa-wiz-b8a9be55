
-- Service Agreements & E-Sign module
CREATE TYPE public.agreement_type AS ENUM (
  'ENGAGEMENT_LETTER', 'SERVICE_AGREEMENT', 'NDA', 'AUTHORIZATION_LETTER', 'CUSTOM'
);
CREATE TYPE public.fee_frequency AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE public.agreement_status AS ENUM (
  'DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'EXPIRED', 'CANCELLED'
);

CREATE TABLE public.agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  agreement_type public.agreement_type NOT NULL DEFAULT 'CUSTOM',
  content_html text NOT NULL,
  services_covered text[] NOT NULL DEFAULT ARRAY[]::text[],
  validity_months integer NOT NULL DEFAULT 12,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agreement_templates_firm ON public.agreement_templates(ca_firm_id);

CREATE TABLE public.client_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.agreement_templates(id) ON DELETE SET NULL,
  agreement_type public.agreement_type NOT NULL DEFAULT 'SERVICE_AGREEMENT',
  title text NOT NULL,
  content_html text NOT NULL,
  services_included text[] NOT NULL DEFAULT ARRAY[]::text[],
  fee_amount numeric,
  fee_frequency public.fee_frequency,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  status public.agreement_status NOT NULL DEFAULT 'DRAFT',
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  signer_phone text,
  otp_verified boolean NOT NULL DEFAULT false,
  signing_ip text,
  signing_device text,
  signed_pdf_url text,
  ca_countersigned boolean NOT NULL DEFAULT false,
  ca_countersigned_at timestamptz,
  custom_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_agreements_firm ON public.client_agreements(ca_firm_id, created_at DESC);
CREATE INDEX idx_client_agreements_client ON public.client_agreements(client_id);
CREATE INDEX idx_client_agreements_status ON public.client_agreements(ca_firm_id, status);
CREATE INDEX idx_client_agreements_expiry ON public.client_agreements(valid_until) WHERE status = 'SIGNED';

CREATE TABLE public.client_agreement_signing (
  agreement_id uuid PRIMARY KEY REFERENCES public.client_agreements(id) ON DELETE CASCADE,
  sign_token text UNIQUE NOT NULL,
  otp_hash text,
  otp_expires_at timestamptz,
  token_expires_at timestamptz NOT NULL
);

CREATE TABLE public.agreement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.client_agreements(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agreement_attachments_agreement ON public.agreement_attachments(agreement_id);

CREATE TABLE public.agreement_expiry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.client_agreements(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  days_before integer NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, days_before)
);

-- Storage bucket for signed PDFs / attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('agreement-documents', 'agreement-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY agreement_docs_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'agreement-documents'
    AND (
      public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.can_access_client(auth.uid(), ((storage.foldername(name))[2])::uuid)
    )
  );
CREATE POLICY agreement_docs_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agreement-documents'
    AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY agreement_docs_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'agreement-documents'
    AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- Grants & RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreement_templates TO authenticated;
GRANT ALL ON public.agreement_templates TO service_role;
ALTER TABLE public.agreement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY at_select ON public.agreement_templates FOR SELECT TO authenticated
  USING (is_system = true OR (ca_firm_id IS NOT NULL AND public.is_ca_firm_member(auth.uid(), ca_firm_id)));
CREATE POLICY at_insert ON public.agreement_templates FOR INSERT TO authenticated
  WITH CHECK (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);
CREATE POLICY at_update ON public.agreement_templates FOR UPDATE TO authenticated
  USING (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);
CREATE POLICY at_delete ON public.agreement_templates FOR DELETE TO authenticated
  USING (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id) AND is_system = false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_agreements TO authenticated;
GRANT ALL ON public.client_agreements TO service_role;
ALTER TABLE public.client_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY ca_agreements_select ON public.client_agreements FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY ca_agreements_insert ON public.client_agreements FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_agreements_update ON public.client_agreements FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_agreements_delete ON public.client_agreements FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreement_attachments TO authenticated;
GRANT ALL ON public.agreement_attachments TO service_role;
ALTER TABLE public.agreement_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY aa_select ON public.agreement_attachments FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR EXISTS (
    SELECT 1 FROM public.client_agreements a
    WHERE a.id = agreement_id AND public.can_access_client(auth.uid(), a.client_id)
  ));
CREATE POLICY aa_write ON public.agreement_attachments FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

GRANT SELECT ON public.client_agreement_signing TO authenticated;
GRANT ALL ON public.client_agreement_signing TO service_role;
ALTER TABLE public.client_agreement_signing ENABLE ROW LEVEL SECURITY;

CREATE POLICY cas_select ON public.client_agreement_signing FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_agreements a
    WHERE a.id = agreement_id AND public.is_ca_owner(auth.uid(), a.ca_firm_id)
  ));

GRANT ALL ON public.agreement_expiry_notifications TO service_role;

CREATE TRIGGER trg_agreement_templates_updated BEFORE UPDATE ON public.agreement_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_agreements_updated BEFORE UPDATE ON public.client_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-expire signed agreements past valid_until
CREATE OR REPLACE FUNCTION public.expire_client_agreements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.client_agreements
    SET status = 'EXPIRED', updated_at = now()
    WHERE status IN ('SIGNED', 'SENT', 'VIEWED')
      AND valid_until < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_client_agreements() FROM PUBLIC, anon, authenticated;

-- Seed system templates
INSERT INTO public.agreement_templates (ca_firm_id, template_name, agreement_type, content_html, services_covered, validity_months, is_default, is_system)
VALUES
(NULL, 'Engagement Letter', 'ENGAGEMENT_LETTER',
'<h1>Letter of Engagement</h1>
<p>Dear {CLIENT_NAME},</p>
<p>This letter confirms that <strong>{CA_FIRM_NAME}</strong> has been engaged to provide professional services as detailed below.</p>
<h2>Services Covered</h2>
<p>{SERVICES_LIST}</p>
<h2>Fee Structure</h2>
<p>{FEE_AMOUNT} ({FEE_FREQUENCY})</p>
<h2>Term</h2>
<p>This engagement is effective from {VALID_FROM} until {VALID_UNTIL}.</p>
<p>By signing this agreement, you acknowledge the scope of services and fee arrangement outlined above.</p>
<p>Date: {DATE}</p>
<p>For {CA_FIRM_NAME}</p>',
ARRAY['General CA Services'], 12, true, true),

(NULL, 'GST Service Agreement', 'SERVICE_AGREEMENT',
'<h1>GST Filing Service Agreement</h1>
<p>This Service Agreement is entered into between <strong>{CA_FIRM_NAME}</strong> (the "Service Provider") and <strong>{CLIENT_NAME}</strong> (the "Client").</p>
<h2>1. Scope of Services</h2>
<p>The Service Provider agrees to perform the following GST-related services:</p>
<p>{SERVICES_LIST}</p>
<h2>2. Fees</h2>
<p>Professional fees: {FEE_AMOUNT} payable {FEE_FREQUENCY}.</p>
<h2>3. Term</h2>
<p>Valid from {VALID_FROM} to {VALID_UNTIL}.</p>
<h2>4. Client Obligations</h2>
<p>The Client shall provide all books, records, and documents necessary for timely GST compliance.</p>
<h2>5. Confidentiality</h2>
<p>Both parties agree to maintain confidentiality of all client information.</p>
<p>Executed on {DATE}.</p>',
ARRAY['GST Filing', 'GSTR-1', 'GSTR-3B'], 12, true, true),

(NULL, 'Full CA Services Agreement', 'SERVICE_AGREEMENT',
'<h1>Comprehensive CA Services Agreement</h1>
<p>Between <strong>{CA_FIRM_NAME}</strong> and <strong>{CLIENT_NAME}</strong>.</p>
<h2>Services Included</h2>
<p>{SERVICES_LIST}</p>
<h2>Professional Fees</h2>
<p>{FEE_AMOUNT} — {FEE_FREQUENCY}</p>
<h2>Validity</h2>
<p>{VALID_FROM} through {VALID_UNTIL}</p>
<h2>Terms & Conditions</h2>
<p>The Client authorizes the CA firm to represent them before tax authorities for the services listed above. All fees are exclusive of applicable taxes.</p>
<p>Date: {DATE}</p>',
ARRAY['GST Filing', 'TDS Returns', 'ITR Filing', 'Bookkeeping', 'Audit', 'MCA Compliance'], 12, true, true),

(NULL, 'Non-Disclosure Agreement', 'NDA',
'<h1>Mutual Non-Disclosure Agreement</h1>
<p>This NDA is between <strong>{CA_FIRM_NAME}</strong> and <strong>{CLIENT_NAME}</strong>, effective {VALID_FROM}.</p>
<h2>1. Confidential Information</h2>
<p>Each party may disclose confidential business, financial, and tax information to the other for the purpose of professional services.</p>
<h2>2. Obligations</h2>
<p>The receiving party shall not disclose confidential information to third parties without prior written consent.</p>
<h2>3. Term</h2>
<p>This agreement remains in effect until {VALID_UNTIL}.</p>
<p>Signed on {DATE}.</p>',
ARRAY['Confidentiality'], 24, false, true),

(NULL, 'Authorization Letter', 'AUTHORIZATION_LETTER',
'<h1>Authorization Letter</h1>
<p>I, the authorized signatory of <strong>{CLIENT_NAME}</strong>, hereby authorize <strong>{CA_FIRM_NAME}</strong> to:</p>
<p>{SERVICES_LIST}</p>
<p>This authorization is valid from {VALID_FROM} to {VALID_UNTIL}.</p>
<p>Date: {DATE}</p>
<p>Client: {CLIENT_NAME}</p>',
ARRAY['Tax Representation', 'GST Portal Access'], 12, false, true);
