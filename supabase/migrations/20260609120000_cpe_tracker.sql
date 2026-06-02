-- ICAI CPE Compliance Tracker

CREATE TABLE IF NOT EXISTS public.ca_professional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  membership_number text,
  membership_type text NOT NULL DEFAULT 'ASSOCIATE'
    CHECK (membership_type IN ('ASSOCIATE','FELLOW')),
  cop_number text,
  cop_expiry_date date,
  current_cpe_block_start date NOT NULL DEFAULT '2022-04-01',
  current_cpe_block_end date NOT NULL DEFAULT '2025-03-31',
  cpe_hours_required integer NOT NULL DEFAULT 120,
  cpe_hours_structured_required integer NOT NULL DEFAULT 90,
  cpe_hours_unstructured_max integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.cpe_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  activity_type text NOT NULL
    CHECK (activity_type IN ('SEMINAR','WEBINAR','CONFERENCE','SELF_READING','WRITING','TEACHING','ICAI_PROGRAM','E_LEARNING','STUDY_CIRCLE')),
  activity_category text NOT NULL
    CHECK (activity_category IN ('STRUCTURED','UNSTRUCTURED')),
  title text NOT NULL,
  organizer text NOT NULL DEFAULT '',
  hours_claimed decimal(5,1) NOT NULL CHECK (hours_claimed > 0 AND hours_claimed <= 24),
  certificate_url text,
  icai_activity_id text,
  verification_status text NOT NULL DEFAULT 'SELF_REPORTED'
    CHECK (verification_status IN ('SELF_REPORTED','VERIFIED','REJECTED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.icai_upcoming_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  organizer text NOT NULL DEFAULT 'ICAI',
  event_type text NOT NULL
    CHECK (event_type IN ('SEMINAR','WEBINAR','CONFERENCE','STUDY_CIRCLE')),
  event_date date NOT NULL,
  event_time time,
  duration_hours decimal(4,1),
  registration_url text,
  is_free boolean NOT NULL DEFAULT true,
  fee_amount decimal(10,2),
  cpe_hours_awarded decimal(4,1),
  topics text[],
  region text NOT NULL DEFAULT 'National',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ca_professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpe_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icai_upcoming_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own CPE profile"
  ON public.ca_professional_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own CPE activities"
  ON public.cpe_activities FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users view events"
  ON public.icai_upcoming_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_cpe_activities_user_date
  ON public.cpe_activities(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_icai_events_date
  ON public.icai_upcoming_events(event_date);
