
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_client_created ON public.activity_logs (client_id, created_at DESC);
CREATE INDEX idx_activity_logs_firm_created ON public.activity_logs (ca_firm_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select"
  ON public.activity_logs FOR SELECT
  USING (public.can_access_client(auth.uid(), client_id));

CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    public.can_access_client(auth.uid(), client_id)
    AND actor_user_id = auth.uid()
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;
