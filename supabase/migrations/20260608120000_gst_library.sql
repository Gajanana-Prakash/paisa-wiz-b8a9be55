CREATE TYPE public.gst_notification_category AS ENUM (
  'RATE_CHANGE', 'EXEMPTION', 'PROCEDURE', 'FORM', 'DEADLINE_EXTENSION', 'OTHER'
);
CREATE TYPE public.gst_impact_level AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE public.hsn_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code text NOT NULL,
  description text NOT NULL,
  chapter text NOT NULL,
  chapter_description text NOT NULL,
  cgst_rate numeric NOT NULL DEFAULT 0,
  sgst_rate numeric NOT NULL DEFAULT 0,
  igst_rate numeric NOT NULL DEFAULT 0,
  cess_rate numeric,
  effective_from date NOT NULL DEFAULT '2017-07-01',
  effective_to date,
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sac_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sac_code text NOT NULL,
  service_description text NOT NULL,
  cgst_rate numeric NOT NULL DEFAULT 0,
  sgst_rate numeric NOT NULL DEFAULT 0,
  igst_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT '2017-07-01',
  effective_to date,
  is_current boolean NOT NULL DEFAULT true,
  exemption_condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gst_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_number text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  full_summary text,
  effective_date date NOT NULL,
  category public.gst_notification_category NOT NULL DEFAULT 'OTHER',
  affected_hsn_codes text[],
  full_text_url text,
  impact_level public.gst_impact_level NOT NULL DEFAULT 'MEDIUM',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gst_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.gst_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS gst_updates_subscribed boolean NOT NULL DEFAULT false;

CREATE INDEX idx_hsn_master_code ON public.hsn_master(hsn_code) WHERE is_current = true;
CREATE INDEX idx_hsn_master_current ON public.hsn_master(is_current) WHERE is_current = true;
CREATE INDEX idx_hsn_master_desc ON public.hsn_master USING gin (to_tsvector('english', description));
CREATE INDEX idx_sac_master_code ON public.sac_master(sac_code) WHERE is_current = true;
CREATE INDEX idx_sac_master_desc ON public.sac_master USING gin (to_tsvector('english', service_description));
CREATE INDEX idx_gst_notifications_date ON public.gst_notifications(effective_date DESC);

GRANT SELECT ON public.hsn_master, public.sac_master, public.gst_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_notification_reads TO authenticated;
GRANT ALL ON public.hsn_master, public.sac_master, public.gst_notifications TO service_role;

ALTER TABLE public.hsn_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sac_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY hsn_select ON public.hsn_master FOR SELECT TO authenticated USING (true);
CREATE POLICY sac_select ON public.sac_master FOR SELECT TO authenticated USING (true);
CREATE POLICY gst_notif_select ON public.gst_notifications FOR SELECT TO authenticated USING (true);

CREATE POLICY gst_read_select ON public.gst_notification_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY gst_read_insert ON public.gst_notification_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY gst_read_update ON public.gst_notification_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_ca_owners_gst_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  impact text;
  link text;
BEGIN
  impact := NEW.impact_level::text;
  link := '/ca/gst-library?notification=' || NEW.id::text;
  INSERT INTO public.ca_notifications (ca_firm_id, user_id, type, title, body, link)
  SELECT ur.ca_firm_id, ur.user_id, 'gst_update',
    '[' || impact || '] ' || left(NEW.title, 120),
  left(NEW.summary, 300),
    link
  FROM public.user_roles ur
  WHERE ur.role = 'ca_owner';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gst_notification_notify
  AFTER INSERT ON public.gst_notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_ca_owners_gst_update();
