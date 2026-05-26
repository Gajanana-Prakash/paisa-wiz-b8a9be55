-- 1) Restrict client_invites SELECT to ca_owner only (tokens/emails are sensitive)
DROP POLICY IF EXISTS invites_select ON public.client_invites;
CREATE POLICY invites_select ON public.client_invites
  FOR SELECT
  USING (is_ca_owner(auth.uid(), ca_firm_id));

-- Also tighten UPDATE to ca_owner (was firm-member)
DROP POLICY IF EXISTS invites_update ON public.client_invites;
CREATE POLICY invites_update ON public.client_invites
  FOR UPDATE
  USING (is_ca_owner(auth.uid(), ca_firm_id));

-- 2) Constrain user_roles INSERT so RLS path can only add ca_staff
--    (ca_owner provisioning happens server-side via supabaseAdmin)
DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
CREATE POLICY user_roles_insert ON public.user_roles
  FOR INSERT
  WITH CHECK (
    ca_firm_id IS NOT NULL
    AND is_ca_owner(auth.uid(), ca_firm_id)
    AND role = 'ca_staff'::app_role
    AND user_id <> auth.uid()
  );