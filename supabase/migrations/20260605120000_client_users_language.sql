CREATE TYPE public.client_preferred_language AS ENUM ('EN', 'HI');

CREATE TABLE public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  preferred_language public.client_preferred_language NOT NULL DEFAULT 'EN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_users_user_client_unique UNIQUE (user_id, client_id)
);

CREATE INDEX idx_client_users_user ON public.client_users(user_id);
CREATE INDEX idx_client_users_client ON public.client_users(client_id);

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_users_select ON public.client_users FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_access_client(auth.uid(), client_id)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND public.is_ca_firm_member(auth.uid(), c.ca_firm_id)
    )
  );

CREATE POLICY client_users_insert ON public.client_users FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.can_access_client(auth.uid(), client_id));

CREATE POLICY client_users_update ON public.client_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.client_users TO authenticated;
GRANT ALL ON public.client_users TO service_role;

CREATE TRIGGER trg_client_users_updated BEFORE UPDATE ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
