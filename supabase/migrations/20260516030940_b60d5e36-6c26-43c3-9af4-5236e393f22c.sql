-- =====================================================
-- WIPE existing financial data
-- =====================================================
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TYPE IF EXISTS public.invoice_status CASCADE;

-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'ca_owner', 'ca_staff', 'client_owner', 'client_employee'
);

CREATE TYPE public.invoice_status AS ENUM (
  'uploaded','processing','review','validated','filed','error'
);

CREATE TYPE public.client_status AS ENUM ('pending_invite','active','archived');

-- =====================================================
-- CA FIRMS
-- =====================================================
CREATE TABLE public.ca_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ca_firms_owner_idx ON public.ca_firms(owner_user_id);

-- =====================================================
-- CLIENTS (businesses managed by a CA firm)
-- =====================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  gstin text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status public.client_status NOT NULL DEFAULT 'pending_invite',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_ca_firm_idx ON public.clients(ca_firm_id);

-- =====================================================
-- USER ROLES (scoped to firm and/or client)
-- =====================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique_idx ON public.user_roles(
  user_id, role, COALESCE(ca_firm_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX user_roles_user_idx ON public.user_roles(user_id);

-- =====================================================
-- CA STAFF ASSIGNMENTS (which clients each staff can access)
-- =====================================================
CREATE TABLE public.ca_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_user_id, client_id)
);
CREATE INDEX ca_staff_firm_idx ON public.ca_staff_assignments(ca_firm_id);

-- =====================================================
-- CLIENT INVITES
-- =====================================================
CREATE TABLE public.client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email text,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_invites_token_idx ON public.client_invites(token);

-- =====================================================
-- INVOICES (multi-tenant)
-- =====================================================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_path text,
  file_name text,
  status public.invoice_status NOT NULL DEFAULT 'uploaded',
  invoice_number text,
  invoice_date date,
  due_date date,
  place_of_supply text,
  vendor_name text,
  vendor_gstin text,
  buyer_name text,
  buyer_gstin text,
  taxable_value numeric DEFAULT 0,
  cgst numeric DEFAULT 0,
  sgst numeric DEFAULT 0,
  igst numeric DEFAULT 0,
  cess numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  currency text DEFAULT 'INR',
  validation_flags jsonb DEFAULT '[]'::jsonb,
  confidence numeric,
  notes text,
  raw_extraction jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_client_idx ON public.invoices(client_id);
CREATE INDEX invoices_ca_firm_idx ON public.invoices(ca_firm_id);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text,
  hsn text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  taxable_value numeric DEFAULT 0,
  gst_rate numeric DEFAULT 0,
  gst_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

-- =====================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_ca_firm_member(_user_id uuid, _ca_firm_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND ca_firm_id = _ca_firm_id
      AND role IN ('ca_owner','ca_staff')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ca_owner(_user_id uuid, _ca_firm_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND ca_firm_id = _ca_firm_id AND role = 'ca_owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.clients c
    JOIN public.user_roles ur ON ur.ca_firm_id = c.ca_firm_id AND ur.user_id = _user_id
    WHERE c.id = _client_id AND ur.role = 'ca_owner'
  ) OR EXISTS(
    SELECT 1 FROM public.ca_staff_assignments
    WHERE client_id = _client_id AND staff_user_id = _user_id
  ) OR EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND client_id = _client_id
      AND role IN ('client_owner','client_employee')
  )
$$;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.ca_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- ca_firms
CREATE POLICY ca_firms_select ON public.ca_firms FOR SELECT USING (public.is_ca_firm_member(auth.uid(), id));
CREATE POLICY ca_firms_insert ON public.ca_firms FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY ca_firms_update ON public.ca_firms FOR UPDATE USING (public.is_ca_owner(auth.uid(), id));
CREATE POLICY ca_firms_delete ON public.ca_firms FOR DELETE USING (public.is_ca_owner(auth.uid(), id));

-- clients
CREATE POLICY clients_select ON public.clients FOR SELECT USING (public.can_access_client(auth.uid(), id));
CREATE POLICY clients_insert ON public.clients FOR INSERT WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY clients_update ON public.clients FOR UPDATE USING (public.is_ca_owner(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), id));
CREATE POLICY clients_delete ON public.clients FOR DELETE USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- user_roles
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT
USING (user_id = auth.uid() OR (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id)));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT
WITH CHECK (
  (user_id = auth.uid() AND role = 'ca_owner' AND ca_firm_id IS NOT NULL)
  OR (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id))
);
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE
USING (ca_firm_id IS NOT NULL AND public.is_ca_owner(auth.uid(), ca_firm_id));

-- ca_staff_assignments
CREATE POLICY ca_staff_select ON public.ca_staff_assignments FOR SELECT
USING (staff_user_id = auth.uid() OR public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY ca_staff_insert ON public.ca_staff_assignments FOR INSERT
WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY ca_staff_delete ON public.ca_staff_assignments FOR DELETE
USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- client_invites
CREATE POLICY invites_select ON public.client_invites FOR SELECT
USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY invites_insert ON public.client_invites FOR INSERT
WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY invites_update ON public.client_invites FOR UPDATE
USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY invites_delete ON public.client_invites FOR DELETE
USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- invoices
CREATE POLICY invoices_select ON public.invoices FOR SELECT USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT WITH CHECK (public.can_access_client(auth.uid(), client_id) AND uploaded_by = auth.uid());
CREATE POLICY invoices_update ON public.invoices FOR UPDATE USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY invoices_delete ON public.invoices FOR DELETE USING (public.can_access_client(auth.uid(), client_id));

-- invoice_items
CREATE POLICY items_select ON public.invoice_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_access_client(auth.uid(), i.client_id)));
CREATE POLICY items_insert ON public.invoice_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_access_client(auth.uid(), i.client_id)));
CREATE POLICY items_update ON public.invoice_items FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_access_client(auth.uid(), i.client_id)));
CREATE POLICY items_delete ON public.invoice_items FOR DELETE
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_access_client(auth.uid(), i.client_id)));

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER trg_ca_firms_updated BEFORE UPDATE ON public.ca_firms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();