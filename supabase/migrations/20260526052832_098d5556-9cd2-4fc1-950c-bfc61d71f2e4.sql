
-- Enums
DO $$ BEGIN
  CREATE TYPE public.compliance_category AS ENUM ('GST','TDS','ITR','ROC_MCA','PF_ESI','AUDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.compliance_applies_to AS ENUM ('ALL','GST_REGISTERED','COMPANIES_ONLY','TDS_DEDUCTOR','EMPLOYER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.compliance_recurrence AS ENUM ('MONTHLY','QUARTERLY','ANNUAL','EVENT_BASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.compliance_deadline_status AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','OVERDUE','NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entity_type AS ENUM ('PROPRIETOR','PARTNERSHIP','LLP','PRIVATE_LTD','PUBLIC_LTD','TRUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- compliance_types: global catalogue
CREATE TABLE public.compliance_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category public.compliance_category NOT NULL,
  description text,
  applies_to public.compliance_applies_to NOT NULL DEFAULT 'ALL',
  recurrence public.compliance_recurrence NOT NULL,
  default_due_day integer NOT NULL,
  default_due_month integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_types_select ON public.compliance_types
  FOR SELECT TO authenticated USING (true);

-- client_compliance_profile
CREATE TABLE public.client_compliance_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  ca_firm_id uuid NOT NULL,
  is_gst_registered boolean NOT NULL DEFAULT false,
  is_company boolean NOT NULL DEFAULT false,
  is_tds_deductor boolean NOT NULL DEFAULT false,
  has_employees boolean NOT NULL DEFAULT false,
  is_audit_applicable boolean NOT NULL DEFAULT false,
  entity_type public.entity_type NOT NULL DEFAULT 'PROPRIETOR',
  gst_filing_frequency text NOT NULL DEFAULT 'monthly' CHECK (gst_filing_frequency IN ('monthly','quarterly')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_compliance_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccp_select ON public.client_compliance_profile
  FOR SELECT USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY ccp_insert ON public.client_compliance_profile
  FOR INSERT WITH CHECK (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY ccp_update ON public.client_compliance_profile
  FOR UPDATE USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY ccp_delete ON public.client_compliance_profile
  FOR DELETE USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER trg_ccp_updated_at
BEFORE UPDATE ON public.client_compliance_profile
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- compliance_deadlines
CREATE TABLE public.compliance_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  compliance_type_id uuid NOT NULL REFERENCES public.compliance_types(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  period_label text NOT NULL,
  status public.compliance_deadline_status NOT NULL DEFAULT 'PENDING',
  assigned_to uuid,
  completed_at timestamptz,
  notes text,
  filing_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_deadlines_unique UNIQUE (client_id, compliance_type_id, period_label)
);

CREATE INDEX idx_cd_firm_due ON public.compliance_deadlines (ca_firm_id, due_date);
CREATE INDEX idx_cd_client_status ON public.compliance_deadlines (client_id, status);
CREATE INDEX idx_cd_assigned ON public.compliance_deadlines (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.compliance_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY cd_select ON public.compliance_deadlines
  FOR SELECT USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY cd_insert ON public.compliance_deadlines
  FOR INSERT WITH CHECK (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY cd_update ON public.compliance_deadlines
  FOR UPDATE USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    AND public.can_access_client(auth.uid(), client_id)
  );
CREATE POLICY cd_delete ON public.compliance_deadlines
  FOR DELETE USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER trg_cd_updated_at
BEFORE UPDATE ON public.compliance_deadlines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- compliance_notification_log: idempotency for "due-soon" / "overdue" notifications
CREATE TABLE public.compliance_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deadline_id uuid NOT NULL REFERENCES public.compliance_deadlines(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  notified_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnl_unique UNIQUE (deadline_id, bucket)
);

ALTER TABLE public.compliance_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY cnl_select ON public.compliance_notification_log
  FOR SELECT USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));

-- Seed compliance_types (full Indian compliance calendar)
INSERT INTO public.compliance_types (code, name, category, description, applies_to, recurrence, default_due_day, default_due_month) VALUES
  -- GST
  ('GSTR_1_M', 'GSTR-1 (Monthly)', 'GST', 'Outward supplies — due 11th of next month', 'GST_REGISTERED', 'MONTHLY', 11, NULL),
  ('GSTR_1_Q', 'GSTR-1 (Quarterly)', 'GST', 'Outward supplies (QRMP) — due 13th of month after quarter end', 'GST_REGISTERED', 'QUARTERLY', 13, NULL),
  ('GSTR_3B_M', 'GSTR-3B (Monthly)', 'GST', 'Summary return — due 20th of next month', 'GST_REGISTERED', 'MONTHLY', 20, NULL),
  ('GSTR_3B_Q', 'GSTR-3B (Quarterly)', 'GST', 'Summary return (QRMP) — due 22nd/24th based on state; we use 24th to stay safe', 'GST_REGISTERED', 'QUARTERLY', 24, NULL),
  ('GSTR_9', 'GSTR-9 Annual Return', 'GST', 'Annual return — due 31st December', 'GST_REGISTERED', 'ANNUAL', 31, 12),
  ('GSTR_9C', 'GSTR-9C Reconciliation Statement', 'GST', 'Reconciliation statement — due 31st December', 'GST_REGISTERED', 'ANNUAL', 31, 12),
  -- TDS
  ('TDS_24Q_26Q_Q1', 'TDS Return Form 24Q/26Q — Q1', 'TDS', 'Quarterly TDS return — due 31st July', 'TDS_DEDUCTOR', 'ANNUAL', 31, 7),
  ('TDS_24Q_26Q_Q2', 'TDS Return Form 24Q/26Q — Q2', 'TDS', 'Quarterly TDS return — due 31st October', 'TDS_DEDUCTOR', 'ANNUAL', 31, 10),
  ('TDS_24Q_26Q_Q3', 'TDS Return Form 24Q/26Q — Q3', 'TDS', 'Quarterly TDS return — due 31st January', 'TDS_DEDUCTOR', 'ANNUAL', 31, 1),
  ('TDS_24Q_26Q_Q4', 'TDS Return Form 24Q/26Q — Q4', 'TDS', 'Quarterly TDS return — due 31st May', 'TDS_DEDUCTOR', 'ANNUAL', 31, 5),
  ('TDS_CHALLAN_M', 'Monthly TDS Challan Payment', 'TDS', 'TDS payment — due 7th of next month', 'TDS_DEDUCTOR', 'MONTHLY', 7, NULL),
  ('TDS_FORM_16', 'TDS Certificate Form 16', 'TDS', 'Form 16 issuance — due 15th June', 'TDS_DEDUCTOR', 'ANNUAL', 15, 6),
  ('TDS_FORM_16A_Q1', 'TDS Certificate Form 16A — Q1', 'TDS', 'Form 16A — due 15 days after quarter end (15 Aug)', 'TDS_DEDUCTOR', 'ANNUAL', 15, 8),
  ('TDS_FORM_16A_Q2', 'TDS Certificate Form 16A — Q2', 'TDS', 'Form 16A — due 15 days after quarter end (15 Nov)', 'TDS_DEDUCTOR', 'ANNUAL', 15, 11),
  ('TDS_FORM_16A_Q3', 'TDS Certificate Form 16A — Q3', 'TDS', 'Form 16A — due 15 days after quarter end (15 Feb)', 'TDS_DEDUCTOR', 'ANNUAL', 15, 2),
  ('TDS_FORM_16A_Q4', 'TDS Certificate Form 16A — Q4', 'TDS', 'Form 16A — due 15 days after quarter end (15 Jun)', 'TDS_DEDUCTOR', 'ANNUAL', 15, 6),
  -- Income Tax
  ('ADV_TAX_Q1', 'Advance Tax Q1 (15%)', 'ITR', 'Advance tax instalment — due 15th June', 'ALL', 'ANNUAL', 15, 6),
  ('ADV_TAX_Q2', 'Advance Tax Q2 (45%)', 'ITR', 'Advance tax instalment — due 15th September', 'ALL', 'ANNUAL', 15, 9),
  ('ADV_TAX_Q3', 'Advance Tax Q3 (75%)', 'ITR', 'Advance tax instalment — due 15th December', 'ALL', 'ANNUAL', 15, 12),
  ('ADV_TAX_Q4', 'Advance Tax Q4 (100%)', 'ITR', 'Advance tax instalment — due 15th March', 'ALL', 'ANNUAL', 15, 3),
  ('ITR_INDIVIDUAL', 'ITR Filing — Individual / Non-audit', 'ITR', 'Individual ITR — due 31st July', 'ALL', 'ANNUAL', 31, 7),
  ('ITR_COMPANY_AUDIT', 'ITR Filing — Companies / Audit cases', 'ITR', 'ITR with audit — due 31st October', 'COMPANIES_ONLY', 'ANNUAL', 31, 10),
  ('TAX_AUDIT_3CA_3CB', 'Tax Audit Report Form 3CA/3CB', 'AUDIT', 'Tax audit report — due 30th September', 'ALL', 'ANNUAL', 30, 9),
  -- ROC / MCA
  ('MGT_7', 'MGT-7 Annual Return', 'ROC_MCA', 'Annual return — due 60 days after AGM', 'COMPANIES_ONLY', 'ANNUAL', 30, 11),
  ('AOC_4', 'AOC-4 Financial Statements', 'ROC_MCA', 'Financial statements — due 30 days after AGM', 'COMPANIES_ONLY', 'ANNUAL', 30, 10),
  ('ADT_1', 'ADT-1 Auditor Appointment', 'ROC_MCA', 'Auditor appointment — due 15 days after AGM', 'COMPANIES_ONLY', 'ANNUAL', 15, 10),
  ('DIR_3_KYC', 'DIR-3 KYC', 'ROC_MCA', 'Director KYC — due 30th September annually', 'COMPANIES_ONLY', 'ANNUAL', 30, 9),
  ('DPT_3', 'DPT-3 Deposits Return', 'ROC_MCA', 'Deposits return — due 30th June', 'COMPANIES_ONLY', 'ANNUAL', 30, 6),
  ('MSME_FORM_1_H1', 'MSME Form 1 (Apr-Sep)', 'ROC_MCA', 'Half-yearly outstanding MSME dues — due April', 'COMPANIES_ONLY', 'ANNUAL', 30, 4),
  ('MSME_FORM_1_H2', 'MSME Form 1 (Oct-Mar)', 'ROC_MCA', 'Half-yearly outstanding MSME dues — due October', 'COMPANIES_ONLY', 'ANNUAL', 31, 10),
  -- PF / ESI
  ('PF_MONTHLY', 'PF Monthly Payment', 'PF_ESI', 'Provident Fund — due 15th of next month', 'EMPLOYER', 'MONTHLY', 15, NULL),
  ('ESI_MONTHLY', 'ESI Monthly Payment', 'PF_ESI', 'ESI contribution — due 15th of next month', 'EMPLOYER', 'MONTHLY', 15, NULL),
  ('PF_ANNUAL', 'PF Annual Return', 'PF_ESI', 'PF annual return — due 30th April', 'EMPLOYER', 'ANNUAL', 30, 4),
  ('ESI_ANNUAL', 'ESI Annual Return', 'PF_ESI', 'ESI annual return — due 11th November', 'EMPLOYER', 'ANNUAL', 11, 11);
