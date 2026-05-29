
-- DSC (Digital Signature Certificate) vault

CREATE TYPE public.dsc_class AS ENUM ('CLASS_2', 'CLASS_3');
CREATE TYPE public.dsc_type AS ENUM ('INDIVIDUAL', 'ORGANIZATION');
CREATE TYPE public.dsc_status AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED');
CREATE TYPE public.dsc_renewal_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'RENEWED');

CREATE TABLE public.dsc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  holder_name text NOT NULL,
  holder_designation text,
  holder_din text,
  holder_pan text,
  dsc_class public.dsc_class NOT NULL DEFAULT 'CLASS_3',
  dsc_type public.dsc_type NOT NULL DEFAULT 'INDIVIDUAL',
  issuing_authority text,
  serial_number text,
  issue_date date NOT NULL,
  expiry_date date NOT NULL,
  token_type text,
  token_physical_location text,
  usb_token_id text,
  status public.dsc_status NOT NULL DEFAULT 'ACTIVE',
  renewal_status public.dsc_renewal_status NOT NULL DEFAULT 'NOT_STARTED',
  used_for text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dsc_records_firm_expiry ON public.dsc_records(ca_firm_id, expiry_date ASC);
CREATE INDEX idx_dsc_records_client ON public.dsc_records(client_id);
CREATE INDEX idx_dsc_records_status ON public.dsc_records(ca_firm_id, status);

CREATE TABLE public.dsc_renewal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dsc_record_id uuid NOT NULL REFERENCES public.dsc_records(id) ON DELETE CASCADE,
  previous_expiry date NOT NULL,
  new_expiry date NOT NULL,
  renewed_by uuid NOT NULL,
  renewed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE INDEX idx_dsc_renewal_history ON public.dsc_renewal_history(dsc_record_id, renewed_at DESC);

ALTER TABLE public.dsc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsc_renewal_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsc_records TO authenticated;
GRANT SELECT, INSERT ON public.dsc_renewal_history TO authenticated;
GRANT ALL ON public.dsc_records TO service_role;
GRANT ALL ON public.dsc_renewal_history TO service_role;

CREATE POLICY dsc_records_select ON public.dsc_records FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY dsc_records_write ON public.dsc_records FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY dsc_renewal_select ON public.dsc_renewal_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dsc_records d
    WHERE d.id = dsc_record_id AND public.is_ca_firm_member(auth.uid(), d.ca_firm_id)
  ));
CREATE POLICY dsc_renewal_insert ON public.dsc_renewal_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dsc_records d
    WHERE d.id = dsc_record_id AND public.is_ca_firm_member(auth.uid(), d.ca_firm_id)
  ));

CREATE TRIGGER dsc_records_set_updated_at BEFORE UPDATE ON public.dsc_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
