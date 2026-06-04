
-- Enums
CREATE TYPE public.tally_import_type AS ENUM ('SALES_LEDGER','PURCHASE_LEDGER','GSTR1_DATA','GSTR2_DATA','FULL_BACKUP');
CREATE TYPE public.tally_version AS ENUM ('TALLY_ERP9','TALLYPRIME','UNKNOWN');
CREATE TYPE public.tally_import_status AS ENUM ('UPLOADED','PROCESSING','COMPLETED','FAILED','PARTIAL');
CREATE TYPE public.tally_gst_category AS ENUM ('SALES','PURCHASE','EXPENSE','ASSET');
CREATE TYPE public.tally_export_type AS ENUM ('GSTR1_JSON','GSTR1_EXCEL','TALLY_XML','TALLY_VOUCHERS');

-- tally_imports
CREATE TABLE public.tally_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  import_type public.tally_import_type NOT NULL,
  file_name text NOT NULL,
  file_url text,
  tally_version public.tally_version NOT NULL DEFAULT 'UNKNOWN',
  import_status public.tally_import_status NOT NULL DEFAULT 'UPLOADED',
  total_records integer NOT NULL DEFAULT 0,
  imported_records integer NOT NULL DEFAULT 0,
  failed_records integer NOT NULL DEFAULT 0,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  staging_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_by uuid NOT NULL,
  period_from date,
  period_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tally_imports TO authenticated;
GRANT ALL ON public.tally_imports TO service_role;
ALTER TABLE public.tally_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ti_select ON public.tally_imports FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY ti_write ON public.tally_imports FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE TRIGGER trg_tally_imports_updated BEFORE UPDATE ON public.tally_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tally_mappings
CREATE TABLE public.tally_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  tally_ledger_name text NOT NULL,
  gst_category public.tally_gst_category NOT NULL,
  gst_rate numeric NOT NULL DEFAULT 0,
  hsn_code text,
  is_confirmed boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tally_mappings_firm_ledger_uniq ON public.tally_mappings (ca_firm_id, lower(tally_ledger_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tally_mappings TO authenticated;
GRANT ALL ON public.tally_mappings TO service_role;
ALTER TABLE public.tally_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_select ON public.tally_mappings FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY tm_write ON public.tally_mappings FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE TRIGGER trg_tally_mappings_updated BEFORE UPDATE ON public.tally_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tally_exports
CREATE TABLE public.tally_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  export_type public.tally_export_type NOT NULL,
  period_from date,
  period_to date,
  file_url text,
  file_name text,
  record_count integer NOT NULL DEFAULT 0,
  generated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tally_exports TO authenticated;
GRANT ALL ON public.tally_exports TO service_role;
ALTER TABLE public.tally_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY te_select ON public.tally_exports FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY te_write ON public.tally_exports FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
