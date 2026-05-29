
-- Client communication hub

CREATE TYPE public.conversation_channel AS ENUM (
  'IN_APP', 'EMAIL', 'WHATSAPP', 'PHONE_CALL', 'MEETING', 'NOTE'
);
CREATE TYPE public.conversation_direction AS ENUM (
  'INBOUND', 'OUTBOUND', 'INTERNAL_NOTE'
);
CREATE TYPE public.call_direction AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  call_type public.call_direction NOT NULL,
  call_date date NOT NULL DEFAULT CURRENT_DATE,
  call_time time NOT NULL DEFAULT (CURRENT_TIME),
  duration_minutes integer,
  outcome text,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_date date,
  follow_up_note text,
  follow_up_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  follow_up_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_logs_client ON public.call_logs(client_id, call_date DESC);
CREATE INDEX idx_call_logs_followup ON public.call_logs(ca_firm_id, follow_up_required, follow_up_date)
  WHERE follow_up_required = true AND follow_up_completed_at IS NULL;

CREATE TABLE public.client_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel public.conversation_channel NOT NULL,
  direction public.conversation_direction NOT NULL,
  subject text,
  body text NOT NULL DEFAULT '',
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  is_pinned boolean NOT NULL DEFAULT false,
  linked_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  linked_document_id uuid,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  parent_conversation_id uuid REFERENCES public.client_conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_conversations_client ON public.client_conversations(client_id, sent_at DESC);
CREATE INDEX idx_client_conversations_firm ON public.client_conversations(ca_firm_id, sent_at DESC);

CREATE TABLE public.client_conversation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.client_conversations(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_attachments ON public.client_conversation_attachments(conversation_id);

CREATE TABLE public.client_conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.client_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.ca_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  user_id uuid,
  type text NOT NULL DEFAULT 'message',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_notifications_user ON public.ca_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_conversation_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conversation_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_conversation_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ca_notifications TO authenticated;
GRANT ALL ON public.call_logs TO service_role;
GRANT ALL ON public.client_conversations TO service_role;
GRANT ALL ON public.client_conversation_attachments TO service_role;
GRANT ALL ON public.client_conversation_reads TO service_role;
GRANT ALL ON public.ca_notifications TO service_role;

-- call_logs
CREATE POLICY call_logs_select ON public.call_logs FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY call_logs_insert ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY call_logs_update ON public.call_logs FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));

-- conversations
CREATE POLICY conv_select ON public.client_conversations FOR SELECT TO authenticated
  USING (
    public.is_ca_firm_member(auth.uid(), ca_firm_id)
    OR (
      channel = 'IN_APP'
      AND public.can_access_client(auth.uid(), client_id)
    )
  );
CREATE POLICY conv_insert ON public.client_conversations FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND direction IN ('OUTBOUND', 'INTERNAL_NOTE'))
    OR (
      channel = 'IN_APP'
      AND direction = 'INBOUND'
      AND public.can_access_client(auth.uid(), client_id)
      AND sent_by = auth.uid()
    )
  );
CREATE POLICY conv_update ON public.client_conversations FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));

-- attachments
CREATE POLICY conv_att_select ON public.client_conversation_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_conversations c
    WHERE c.id = conversation_id
    AND (public.is_ca_firm_member(auth.uid(), c.ca_firm_id) OR (c.channel = 'IN_APP' AND public.can_access_client(auth.uid(), c.client_id)))
  ));
CREATE POLICY conv_att_insert ON public.client_conversation_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.client_conversations c WHERE c.id = conversation_id
    AND (public.is_ca_firm_member(auth.uid(), c.ca_firm_id) OR public.can_access_client(auth.uid(), c.client_id))
  ));

-- reads
CREATE POLICY conv_reads_all ON public.client_conversation_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notifications
CREATE POLICY ca_notif_select ON public.ca_notifications FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY ca_notif_update ON public.ca_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_ca_owner(auth.uid(), ca_firm_id)));

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('communication-attachments', 'communication-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY comm_att_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'communication-attachments' AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY comm_att_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'communication-attachments' AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY comm_att_storage_client_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'communication-attachments' AND public.can_access_client(auth.uid(), ((storage.foldername(name))[2])::uuid));
