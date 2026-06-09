
-- Enums
CREATE TYPE public.ewb_status AS ENUM ('ACTIVE','CANCELLED','EXPIRED','EXTENDED');
CREATE TYPE public.ewb_supply_type AS ENUM ('OUTWARD','INWARD');
CREATE TYPE public.ewb_transaction_type AS ENUM ('REGULAR','BILL_TO_SHIP_TO','BILL_FROM_DISPATCH_FROM','COMBINATION');
CREATE TYPE public.ewb_document_type AS ENUM ('TAX_INVOICE','BILL_OF_SUPPLY','CHALLAN','CREDIT_NOTE','BILL_OF_ENTRY','OTHERS');
CREATE TYPE public.ewb_transport_mode AS ENUM ('ROAD','RAIL','AIR','SHIP');
CREATE TYPE public.ewb_vehicle_type AS ENUM ('REGULAR','OVER_DIMENSIONAL_CARGO');

-- eway_bills
CREATE TABLE public.eway_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.ca_invoices(id) ON DELETE SET NULL,
  e_invoice_id uuid REFERENCES public.e_invoices(id) ON DELETE SET NULL,
  ewb_number text,
  ewb_date timestamptz,
  ewb_valid_until timestamptz,
  ewb_status public.ewb_status NOT NULL DEFAULT 'ACTIVE',
  supply_type public.ewb_supply_type NOT NULL,
  transaction_type public.ewb_transaction_type NOT NULL DEFAULT 'REGULAR',
  document_type public.ewb_document_type NOT NULL DEFAULT 'TAX_INVOICE',
  document_number text NOT NULL,
  document_date date NOT NULL,
  from_gstin text,
  from_place text,
  from_pincode text,
  from_state_code text,
  to_gstin text,
  to_trade_name text,
  to_place text,
  to_pincode text,
  to_state_code text,
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  hsn_code text,
  transport_mode public.ewb_transport_mode NOT NULL DEFAULT 'ROAD',
  vehicle_number text,
  vehicle_type public.ewb_vehicle_type NOT NULL DEFAULT 'REGULAR',
  transporter_name text,
  transporter_id text,
  distance_km integer NOT NULL DEFAULT 0,
  cancellation_reason text,
  cancelled_at timestamptz,
  extension_count integer NOT NULL DEFAULT 0,
  raw_api_response jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eway_bills TO authenticated;
GRANT ALL ON public.eway_bills TO service_role;
ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ewb_select" ON public.eway_bills FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY "ewb_write" ON public.eway_bills FOR ALL TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));

CREATE INDEX eway_bills_firm_status_idx ON public.eway_bills(ca_firm_id, ewb_status);
CREATE INDEX eway_bills_client_idx ON public.eway_bills(client_id);
CREATE INDEX eway_bills_valid_idx ON public.eway_bills(ewb_valid_until) WHERE ewb_status IN ('ACTIVE','EXTENDED');

CREATE TRIGGER eway_bills_updated_at BEFORE UPDATE ON public.eway_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- eway_bill_items
CREATE TABLE public.eway_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eway_bill_id uuid NOT NULL REFERENCES public.eway_bills(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  hsn_code text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text,
  taxable_value numeric(14,2) NOT NULL DEFAULT 0,
  cgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  sgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  igst_rate numeric(5,2) NOT NULL DEFAULT 0,
  cess_rate numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eway_bill_items TO authenticated;
GRANT ALL ON public.eway_bill_items TO service_role;
ALTER TABLE public.eway_bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ewbi_select" ON public.eway_bill_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eway_bills b
    WHERE b.id = eway_bill_id
      AND (public.is_ca_firm_member(auth.uid(), b.ca_firm_id) OR public.can_access_client(auth.uid(), b.client_id))
  ));
CREATE POLICY "ewbi_write" ON public.eway_bill_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eway_bills b
    WHERE b.id = eway_bill_id AND public.is_ca_firm_member(auth.uid(), b.ca_firm_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.eway_bills b
    WHERE b.id = eway_bill_id AND public.is_ca_firm_member(auth.uid(), b.ca_firm_id)
  ));

CREATE INDEX eway_bill_items_ewb_idx ON public.eway_bill_items(eway_bill_id);

-- eway_bill_settings
CREATE TABLE public.eway_bill_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL UNIQUE REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  gstin text,
  ewb_username text,
  ewb_password text,
  sandbox_mode boolean NOT NULL DEFAULT true,
  is_configured boolean NOT NULL DEFAULT false,
  default_transport_mode public.ewb_transport_mode NOT NULL DEFAULT 'ROAD',
  default_vehicle_type public.ewb_vehicle_type NOT NULL DEFAULT 'REGULAR',
  auto_link_with_einvoice boolean NOT NULL DEFAULT true,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eway_bill_settings TO authenticated;
GRANT ALL ON public.eway_bill_settings TO service_role;
ALTER TABLE public.eway_bill_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ewbs_owner_all" ON public.eway_bill_settings FOR ALL TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id))
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER eway_bill_settings_updated_at BEFORE UPDATE ON public.eway_bill_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
