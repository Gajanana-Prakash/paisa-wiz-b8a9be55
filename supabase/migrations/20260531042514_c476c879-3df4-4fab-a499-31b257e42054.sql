
CREATE TYPE public.vault_file_type AS ENUM ('PDF','IMAGE','EXCEL','WORD','OTHER');
CREATE TYPE public.vault_doc_category AS ENUM ('KYC','GST','INCOME_TAX','AUDIT','BANKING','CORPORATE','INVOICES','NOTICES','AGREEMENTS','OTHER');
CREATE TYPE public.vault_source AS ENUM ('MANUAL_UPLOAD','CLIENT_UPLOAD','ONBOARDING','AI_EXTRACTED','GENERATED');
CREATE TYPE public.vault_access_level AS ENUM ('CA_ONLY','CA_AND_CLIENT','CLIENT_ONLY');
CREATE TYPE public.vault_access_action AS ENUM ('VIEWED','DOWNLOADED','SHARED','DELETED_REQUEST');

CREATE TABLE public.document_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  display_name text NOT NULL,
  file_type public.vault_file_type NOT NULL DEFAULT 'OTHER',
  file_size_bytes bigint NOT NULL DEFAULT 0,
  document_category public.vault_doc_category NOT NULL DEFAULT 'OTHER',
  document_subcategory text,
  financial_year text,
  period text,
  description text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_kyc_document boolean NOT NULL DEFAULT false,
  source public.vault_source NOT NULL DEFAULT 'MANUAL_UPLOAD',
  linked_filing_id uuid,
  linked_notice_id uuid,
  linked_invoice_id uuid,
  version_number int NOT NULL DEFAULT 1,
  parent_document_id uuid REFERENCES public.document_vault(id) ON DELETE SET NULL,
  is_latest_version boolean NOT NULL DEFAULT true,
  access_level public.vault_access_level NOT NULL DEFAULT 'CA_ONLY',
  search_tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.document_vault_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    coalesce(NEW.display_name,'') || ' ' ||
    coalesce(NEW.document_subcategory,'') || ' ' ||
    coalesce(NEW.description,'') || ' ' ||
    coalesce(NEW.financial_year,'') || ' ' ||
    coalesce(NEW.period,'') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '),'')
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_dv_tsv BEFORE INSERT OR UPDATE ON public.document_vault
FOR EACH ROW EXECUTE FUNCTION public.document_vault_tsv_trigger();

CREATE TRIGGER trg_dv_updated_at BEFORE UPDATE ON public.document_vault
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_dv_firm_client ON public.document_vault(ca_firm_id, client_id);
CREATE INDEX idx_dv_client_cat ON public.document_vault(client_id, document_category);
CREATE INDEX idx_dv_client_fy ON public.document_vault(client_id, financial_year);
CREATE INDEX idx_dv_tags ON public.document_vault USING GIN(tags);
CREATE INDEX idx_dv_search ON public.document_vault USING GIN(search_tsv);
CREATE INDEX idx_dv_latest ON public.document_vault(client_id) WHERE is_latest_version = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_vault TO authenticated;
GRANT ALL ON public.document_vault TO service_role;

ALTER TABLE public.document_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY dv_select ON public.document_vault FOR SELECT TO authenticated
USING (
  can_access_client(auth.uid(), client_id)
  AND (
    is_ca_firm_member(auth.uid(), ca_firm_id)
    OR access_level IN ('CA_AND_CLIENT','CLIENT_ONLY')
  )
);

CREATE POLICY dv_insert ON public.document_vault FOR INSERT TO authenticated
WITH CHECK (
  is_ca_firm_member(auth.uid(), ca_firm_id)
  AND can_access_client(auth.uid(), client_id)
  AND uploaded_by = auth.uid()
);

CREATE POLICY dv_update ON public.document_vault FOR UPDATE TO authenticated
USING (is_ca_firm_member(auth.uid(), ca_firm_id))
WITH CHECK (is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY dv_delete ON public.document_vault FOR DELETE TO authenticated
USING (is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE TABLE public.document_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.document_vault(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL,
  action public.vault_access_action NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

CREATE INDEX idx_dal_doc ON public.document_access_log(document_id, accessed_at DESC);
CREATE INDEX idx_dal_firm ON public.document_access_log(ca_firm_id, accessed_at DESC);

GRANT SELECT, INSERT ON public.document_access_log TO authenticated;
GRANT ALL ON public.document_access_log TO service_role;

ALTER TABLE public.document_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY dal_select ON public.document_access_log FOR SELECT TO authenticated
USING (is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY dal_insert ON public.document_access_log FOR INSERT TO authenticated
WITH CHECK (
  accessed_by = auth.uid()
  AND EXISTS(
    SELECT 1 FROM public.document_vault d
    WHERE d.id = document_access_log.document_id
      AND can_access_client(auth.uid(), d.client_id)
      AND d.ca_firm_id = document_access_log.ca_firm_id
  )
);
