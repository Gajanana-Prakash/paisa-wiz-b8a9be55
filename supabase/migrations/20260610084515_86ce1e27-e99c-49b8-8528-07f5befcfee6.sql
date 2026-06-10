-- Bank Reconciliation Module

-- Enums
CREATE TYPE public.bank_account_type AS ENUM ('CURRENT','SAVINGS','OD','CC');
CREATE TYPE public.bank_statement_file_type AS ENUM ('PDF','EXCEL','CSV');
CREATE TYPE public.bank_recon_status AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETED');
CREATE TYPE public.bank_txn_type AS ENUM ('CREDIT','DEBIT');
CREATE TYPE public.bank_txn_category AS ENUM ('SALES_RECEIPT','PURCHASE_PAYMENT','TAX_PAYMENT','SALARY','BANK_CHARGES','LOAN','INTEREST','UNKNOWN');
CREATE TYPE public.bank_txn_match_status AS ENUM ('UNMATCHED','MATCHED','MANUALLY_MATCHED','EXCLUDED');
CREATE TYPE public.bank_txn_matched_by AS ENUM ('AI','MANUAL','AUTO_RULE');

-- bank_statements
CREATE TABLE public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text,
  account_type public.bank_account_type NOT NULL DEFAULT 'CURRENT',
  statement_period_from date,
  statement_period_to date,
  file_url text NOT NULL,
  file_type public.bank_statement_file_type NOT NULL,
  opening_balance numeric(18,2),
  closing_balance numeric(18,2),
  total_credits numeric(18,2) DEFAULT 0,
  total_debits numeric(18,2) DEFAULT 0,
  transaction_count integer DEFAULT 0,
  reconciliation_status public.bank_recon_status NOT NULL DEFAULT 'NOT_STARTED',
  reconciled_count integer DEFAULT 0,
  unreconciled_count integer DEFAULT 0,
  parse_error text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY bs_select ON public.bank_statements FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id));
CREATE POLICY bs_write ON public.bank_statements FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER bs_updated_at BEFORE UPDATE ON public.bank_statements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- bank_transactions
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  value_date date,
  description text NOT NULL,
  cleaned_description text,
  transaction_type public.bank_txn_type NOT NULL,
  amount numeric(18,2) NOT NULL,
  balance_after numeric(18,2),
  reference_number text,
  category public.bank_txn_category NOT NULL DEFAULT 'UNKNOWN',
  reconciliation_status public.bank_txn_match_status NOT NULL DEFAULT 'UNMATCHED',
  matched_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  match_confidence numeric(4,3),
  matched_by public.bank_txn_matched_by,
  notes text,
  row_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bt_stmt_idx ON public.bank_transactions(statement_id);
CREATE INDEX bt_client_idx ON public.bank_transactions(client_id, transaction_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_select ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id));
CREATE POLICY bt_write ON public.bank_transactions FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER bt_updated_at BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- reconciliation_rules
CREATE TABLE public.reconciliation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  description_contains text NOT NULL,
  amount_min numeric(18,2),
  amount_max numeric(18,2),
  category public.bank_txn_category NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_rules TO authenticated;
GRANT ALL ON public.reconciliation_rules TO service_role;
ALTER TABLE public.reconciliation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY rr_select ON public.reconciliation_rules FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY rr_write ON public.reconciliation_rules FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE TRIGGER rr_updated_at BEFORE UPDATE ON public.reconciliation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- bank_recon_settings (per firm)
CREATE TABLE public.bank_recon_settings (
  ca_firm_id uuid PRIMARY KEY REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  match_tolerance numeric(10,2) NOT NULL DEFAULT 1,
  auto_exclude_below numeric(10,2) NOT NULL DEFAULT 0,
  date_window_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_recon_settings TO authenticated;
GRANT ALL ON public.bank_recon_settings TO service_role;
ALTER TABLE public.bank_recon_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY brs_select ON public.bank_recon_settings FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY brs_write ON public.bank_recon_settings FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE TRIGGER brs_updated_at BEFORE UPDATE ON public.bank_recon_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();