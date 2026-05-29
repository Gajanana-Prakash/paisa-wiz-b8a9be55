
-- Enums
CREATE TYPE public.leave_type AS ENUM ('CASUAL','SICK','EARNED','HALF_DAY','COMP_OFF');
CREATE TYPE public.leave_status AS ENUM ('PENDING','APPROVED','REJECTED');

-- staff_profiles
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  user_id uuid NOT NULL,
  designation text,
  billing_rate_per_hour numeric NOT NULL DEFAULT 0,
  cost_rate_per_hour numeric NOT NULL DEFAULT 0,
  weekly_target_hours integer NOT NULL DEFAULT 40,
  leave_balance integer NOT NULL DEFAULT 12,
  joining_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, user_id)
);
CREATE INDEX idx_staff_profiles_firm ON public.staff_profiles(ca_firm_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_profiles_select ON public.staff_profiles FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY staff_profiles_insert ON public.staff_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY staff_profiles_update ON public.staff_profiles FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY staff_profiles_delete ON public.staff_profiles FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE TRIGGER staff_profiles_set_updated_at BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- time_logs
CREATE TABLE public.time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  client_id uuid,
  task_id uuid,
  description text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes integer,
  is_billable boolean NOT NULL DEFAULT true,
  billing_rate_per_hour numeric NOT NULL DEFAULT 0,
  billable_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_logs_firm_start ON public.time_logs(ca_firm_id, started_at DESC);
CREATE INDEX idx_time_logs_staff_start ON public.time_logs(staff_user_id, started_at DESC);
CREATE INDEX idx_time_logs_client ON public.time_logs(client_id);
CREATE INDEX idx_time_logs_task ON public.time_logs(task_id);
CREATE UNIQUE INDEX idx_time_logs_one_running ON public.time_logs(staff_user_id) WHERE ended_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_logs TO authenticated;
GRANT ALL ON public.time_logs TO service_role;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_logs_select ON public.time_logs FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY time_logs_insert ON public.time_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id)
              AND (staff_user_id = auth.uid() OR public.is_ca_owner(auth.uid(), ca_firm_id)));
CREATE POLICY time_logs_update ON public.time_logs FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id)
         AND (staff_user_id = auth.uid() OR public.is_ca_owner(auth.uid(), ca_firm_id)));
CREATE POLICY time_logs_delete ON public.time_logs FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

-- leave_records
CREATE TABLE public.leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  leave_date date NOT NULL,
  leave_type public.leave_type NOT NULL,
  reason text,
  approved_by uuid,
  status public.leave_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leave_records_firm ON public.leave_records(ca_firm_id);
CREATE INDEX idx_leave_records_staff ON public.leave_records(staff_user_id, leave_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_records TO authenticated;
GRANT ALL ON public.leave_records TO service_role;
ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_records_select ON public.leave_records FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY leave_records_insert ON public.leave_records FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND staff_user_id = auth.uid());
CREATE POLICY leave_records_update ON public.leave_records FOR UPDATE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));
CREATE POLICY leave_records_delete ON public.leave_records FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id)
         OR (staff_user_id = auth.uid() AND status = 'PENDING'));
