
-- CA firm fee invoicing (separate from client-uploaded invoices)

CREATE TYPE public.service_unit AS ENUM ('FIXED', 'PER_RETURN', 'PER_HOUR', 'PER_MONTH');
CREATE TYPE public.ca_invoice_status AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE public.ca_payment_mode AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD');

-- Per-firm billing settings
CREATE TABLE public.ca_firm_billing_settings (
  ca_firm_id uuid PRIMARY KEY REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  pan text,
  gstin text,
  firm_state_code text,
  bank_name text,
  bank_account text,
  bank_ifsc text,
  account_holder text,
  upi_id text,
  invoice_number_format text NOT NULL DEFAULT 'INV-{YEAR}-{NUMBER}',
  invoice_next_number integer NOT NULL DEFAULT 1,
  default_payment_terms text NOT NULL DEFAULT 'Due within 15 days of invoice date',
  default_gst_rate numeric NOT NULL DEFAULT 18,
  signature_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ca_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  default_amount numeric NOT NULL DEFAULT 0,
  unit public.service_unit NOT NULL DEFAULT 'FIXED',
  hsn_sac_code text NOT NULL DEFAULT '998231',
  gst_rate numeric NOT NULL DEFAULT 18,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_services_firm ON public.ca_services(ca_firm_id);

CREATE TABLE public.ca_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  period_label text,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  is_inter_state boolean NOT NULL DEFAULT false,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  status public.ca_invoice_status NOT NULL DEFAULT 'DRAFT',
  payment_terms text,
  notes text,
  upi_link text,
  sent_at timestamptz,
  paid_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, invoice_number)
);
CREATE INDEX idx_ca_invoices_firm_date ON public.ca_invoices(ca_firm_id, invoice_date DESC);
CREATE INDEX idx_ca_invoices_client ON public.ca_invoices(client_id);
CREATE INDEX idx_ca_invoices_status ON public.ca_invoices(ca_firm_id, status);

CREATE TABLE public.ca_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.ca_invoices(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.ca_services(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  line_subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_ca_invoice_items_invoice ON public.ca_invoice_items(invoice_id);

CREATE TABLE public.ca_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.ca_invoices(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode public.ca_payment_mode NOT NULL,
  reference_number text,
  notes text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_payments_invoice ON public.ca_payments(invoice_id);

-- Monthly retainer auto-invoice
CREATE TABLE public.ca_client_retainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  day_of_month integer NOT NULL DEFAULT 1 CHECK (day_of_month >= 1 AND day_of_month <= 28),
  description text NOT NULL DEFAULT 'Monthly retainer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, client_id)
);

-- RLS
ALTER TABLE public.ca_firm_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_client_retainers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_firm_billing_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_retainers TO authenticated;
GRANT ALL ON public.ca_firm_billing_settings TO service_role;
GRANT ALL ON public.ca_services TO service_role;
GRANT ALL ON public.ca_invoices TO service_role;
GRANT ALL ON public.ca_invoice_items TO service_role;
GRANT ALL ON public.ca_payments TO service_role;
GRANT ALL ON public.ca_client_retainers TO service_role;

CREATE POLICY ca_billing_settings_select ON public.ca_firm_billing_settings FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_billing_settings_write ON public.ca_firm_billing_settings FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE POLICY ca_services_select ON public.ca_services FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_services_write ON public.ca_services FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY ca_invoices_select ON public.ca_invoices FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_invoices_write ON public.ca_invoices FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY ca_invoice_items_select ON public.ca_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ca_invoices i WHERE i.id = invoice_id AND public.is_ca_firm_member(auth.uid(), i.ca_firm_id)));
CREATE POLICY ca_invoice_items_write ON public.ca_invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ca_invoices i WHERE i.id = invoice_id AND public.is_ca_firm_member(auth.uid(), i.ca_firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ca_invoices i WHERE i.id = invoice_id AND public.is_ca_firm_member(auth.uid(), i.ca_firm_id)));

CREATE POLICY ca_payments_select ON public.ca_payments FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_payments_write ON public.ca_payments FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE POLICY ca_retainers_select ON public.ca_client_retainers FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY ca_retainers_write ON public.ca_client_retainers FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER ca_firm_billing_settings_updated BEFORE UPDATE ON public.ca_firm_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ca_services_updated BEFORE UPDATE ON public.ca_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ca_invoices_updated BEFORE UPDATE ON public.ca_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
