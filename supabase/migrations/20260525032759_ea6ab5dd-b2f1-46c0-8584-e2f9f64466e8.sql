
CREATE TYPE public.reminder_trigger AS ENUM ('gst_due_offset','monthly_day','stale_upload_days','manual');
CREATE TYPE public.reminder_channel AS ENUM ('in_app','email','whatsapp');
CREATE TYPE public.reminder_status AS ENUM ('scheduled','sent','skipped','failed');

CREATE TABLE public.reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL,
  client_id UUID,
  name TEXT NOT NULL,
  trigger_type public.reminder_trigger NOT NULL,
  offset_days INTEGER,
  day_of_month INTEGER,
  message_template TEXT NOT NULL DEFAULT 'Hi {client}, your CA {firm} has a reminder for you.',
  channels public.reminder_channel[] NOT NULL DEFAULT ARRAY['in_app','whatsapp']::public.reminder_channel[],
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminder_rules_select ON public.reminder_rules FOR SELECT
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY reminder_rules_insert ON public.reminder_rules FOR INSERT
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND created_by = auth.uid());
CREATE POLICY reminder_rules_update ON public.reminder_rules FOR UPDATE
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY reminder_rules_delete ON public.reminder_rules FOR DELETE
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER reminder_rules_updated BEFORE UPDATE ON public.reminder_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL,
  client_id UUID NOT NULL,
  rule_id UUID,
  due_for_date DATE,
  channel public.reminder_channel NOT NULL,
  status public.reminder_status NOT NULL DEFAULT 'scheduled',
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_select ON public.reminders FOR SELECT
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY reminders_insert ON public.reminders FOR INSERT
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY reminders_update ON public.reminders FOR UPDATE
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY reminders_delete ON public.reminders FOR DELETE
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE INDEX idx_reminder_rules_firm ON public.reminder_rules(ca_firm_id);
CREATE INDEX idx_reminder_rules_client ON public.reminder_rules(client_id);
CREATE INDEX idx_reminders_firm_client ON public.reminders(ca_firm_id, client_id);
CREATE INDEX idx_reminders_created ON public.reminders(created_at DESC);
