
-- Enum
CREATE TYPE public.irn_status AS ENUM ('PENDING','GENERATED','CANCELLED','FAILED');

-- e_invoices
CREATE TABLE public.e_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  invoice_id uuid NOT NULL UNIQUE,
  irn text,
  irn_status public.irn_status NOT NULL DEFAULT 'PENDING',
  ack_number text,
  ack_date timestamptz,
  qr_code_data text,
  qr_code_image_url text,
  signed_invoice_json text,
  cancellation_reason text,
  cancelled_at timestamptz,
  irp_response_raw jsonb,
  invoice_date date NOT NULL,
  upload_deadline date GENERATED ALWAYS AS (invoice_date + INTERVAL '30 days') STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX e_invoices_firm_status_idx ON public.e_invoices(ca_firm_id, irn_status);
CREATE INDEX e_invoices_client_idx ON public.e_invoices(client_id);
CREATE INDEX e_invoices_deadline_idx ON public.e_invoices(upload_deadline) WHERE irn_status = 'PENDING';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_invoices TO authenticated;
GRANT ALL ON public.e_invoices TO service_role;
ALTER TABLE public.e_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ei_select ON public.e_invoices
  FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY ei_write ON public.e_invoices
  FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE TRIGGER e_invoices_updated_at BEFORE UPDATE ON public.e_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- e_invoice_settings (one per firm). Plain-text placeholders in mock mode.
CREATE TABLE public.e_invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL UNIQUE,
  gstin text,
  irp_username text,
  irp_password text,
  client_id_irp text,
  client_secret text,
  sandbox_mode boolean NOT NULL DEFAULT true,
  is_configured boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_invoice_settings TO authenticated;
GRANT ALL ON public.e_invoice_settings TO service_role;
ALTER TABLE public.e_invoice_settings ENABLE ROW LEVEL SECURITY;

-- Owner-only: contains credential placeholders
CREATE POLICY eis_owner_all ON public.e_invoice_settings
  FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER e_invoice_settings_updated_at BEFORE UPDATE ON public.e_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
