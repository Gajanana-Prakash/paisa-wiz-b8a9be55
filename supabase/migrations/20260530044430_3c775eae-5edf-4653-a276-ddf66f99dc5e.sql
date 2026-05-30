-- Tighten compliance_types SELECT to users with any tenant role (excludes bare auth users).
-- Clients legitimately need this catalog (joined into their compliance deadlines), so we keep
-- it accessible to all roles but stop leaking it to authenticated users with no role assigned.
DROP POLICY IF EXISTS compliance_types_select ON public.compliance_types;

CREATE POLICY compliance_types_select
ON public.compliance_types
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);