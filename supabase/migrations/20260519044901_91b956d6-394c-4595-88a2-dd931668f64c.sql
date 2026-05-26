
-- Enum for request status
DO $$ BEGIN
  CREATE TYPE public.doc_request_status AS ENUM ('pending','partial','complete','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.doc_request_type AS ENUM ('purchase_bills','sales_invoices','bank_statement','expense_proofs','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_by uuid NOT NULL,
  doc_type public.doc_request_type NOT NULL,
  period_label text,
  note text,
  due_date date,
  status public.doc_request_status NOT NULL DEFAULT 'pending',
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_requests_client ON public.document_requests(client_id);
CREATE INDEX idx_doc_requests_firm ON public.document_requests(ca_firm_id);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_requests_select" ON public.document_requests
  FOR SELECT USING (public.can_access_client(auth.uid(), client_id));

CREATE POLICY "doc_requests_insert" ON public.document_requests
  FOR INSERT WITH CHECK (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND public.can_access_client(auth.uid(), client_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "doc_requests_update" ON public.document_requests
  FOR UPDATE USING (public.can_access_client(auth.uid(), client_id));

CREATE POLICY "doc_requests_delete" ON public.document_requests
  FOR DELETE USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER trg_doc_requests_updated
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_request_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, invoice_id)
);

CREATE INDEX idx_dru_request ON public.document_request_uploads(request_id);

ALTER TABLE public.document_request_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dru_select" ON public.document_request_uploads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.document_requests r
      WHERE r.id = request_id AND public.can_access_client(auth.uid(), r.client_id)
    )
  );

CREATE POLICY "dru_insert" ON public.document_request_uploads
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.document_requests r
      WHERE r.id = request_id AND public.can_access_client(auth.uid(), r.client_id)
    )
  );

CREATE POLICY "dru_delete" ON public.document_request_uploads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.document_requests r
      WHERE r.id = request_id AND public.can_access_client(auth.uid(), r.client_id)
    )
  );
