
DROP VIEW IF EXISTS public.staff_profiles_rates;
-- Rate columns not granted to authenticated at all; only service_role/supabaseAdmin can read.
-- (Table SELECT was already reduced to safe columns in prior migration.)
