
-- Client self-service: queries, payment proofs, in-app notifications
CREATE TYPE public.client_query_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE public.client_query_priority AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE public.client_query_replier AS ENUM ('CLIENT', 'CA_STAFF');

CREATE TABLE public.client_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  status public.client_query_status NOT NULL DEFAULT 'OPEN',
  priority public.client_query_priority NOT NULL DEFAULT 'NORMAL',
  assigned_to uuid,
  resolved_at timestamptz,
  client_rating integer CHECK (client_rating BETWEEN 1 AND 5),
  client_rating_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_queries_client ON public.client_queries(client_id, created_at DESC);
CREATE INDEX idx_client_queries_firm ON public.client_queries(ca_firm_id, status);

CREATE TABLE public.client_query_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.client_queries(id) ON DELETE CASCADE,
  replied_by_type public.client_query_replier NOT NULL,
  replied_by_id uuid NOT NULL,
  message text NOT NULL,
  attachments text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_query_replies_query ON public.client_query_replies(query_id, created_at);

CREATE TABLE public.client_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.ca_invoices(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  proof_file_path text NOT NULL,
  reference_number text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
  submitted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_payment_proofs_invoice ON public.client_payment_proofs(invoice_id);

CREATE TABLE public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_notifications_user ON public.client_notifications(client_id, user_id, created_at DESC);

-- Storage for payment proof uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY payment_proofs_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.can_access_client(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );
CREATE POLICY payment_proofs_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND public.can_access_client(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

GRANT SELECT, INSERT, UPDATE ON public.client_queries TO authenticated;
GRANT SELECT, INSERT ON public.client_query_replies TO authenticated;
GRANT SELECT, INSERT ON public.client_payment_proofs TO authenticated;
GRANT SELECT, UPDATE ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_queries TO service_role;
GRANT ALL ON public.client_query_replies TO service_role;
GRANT ALL ON public.client_payment_proofs TO service_role;
GRANT ALL ON public.client_notifications TO service_role;

ALTER TABLE public.client_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_query_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Queries: clients read/write own; CA firm members manage
CREATE POLICY cq_select ON public.client_queries FOR SELECT TO authenticated
  USING (
    public.can_access_client(auth.uid(), client_id)
    OR public.is_ca_firm_member(auth.uid(), ca_firm_id)
  );
CREATE POLICY cq_insert ON public.client_queries FOR INSERT TO authenticated
  WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE POLICY cq_update ON public.client_queries FOR UPDATE TO authenticated
  USING (
    public.can_access_client(auth.uid(), client_id)
    OR public.is_ca_firm_member(auth.uid(), ca_firm_id)
  );

CREATE POLICY cqr_select ON public.client_query_replies FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_queries q
    WHERE q.id = query_id
      AND (public.can_access_client(auth.uid(), q.client_id) OR public.is_ca_firm_member(auth.uid(), q.ca_firm_id))
  ));
CREATE POLICY cqr_insert ON public.client_query_replies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_queries q
    WHERE q.id = query_id
      AND (public.can_access_client(auth.uid(), q.client_id) OR public.is_ca_firm_member(auth.uid(), q.ca_firm_id))
  ));

CREATE POLICY cpp_select ON public.client_payment_proofs FOR SELECT TO authenticated
  USING (
    public.can_access_client(auth.uid(), client_id)
    OR public.is_ca_firm_member(auth.uid(), ca_firm_id)
  );
CREATE POLICY cpp_insert ON public.client_payment_proofs FOR INSERT TO authenticated
  WITH CHECK (public.can_access_client(auth.uid(), client_id) AND submitted_by = auth.uid());

CREATE POLICY cn_select ON public.client_notifications FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY cn_update ON public.client_notifications FOR UPDATE TO authenticated
  USING (public.can_access_client(auth.uid(), client_id));

CREATE TRIGGER trg_client_queries_updated BEFORE UPDATE ON public.client_queries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
