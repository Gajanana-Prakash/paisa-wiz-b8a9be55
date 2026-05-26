
-- 1. Fix can_access_client: verify staff assignment is for client's own firm
CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.clients c
    JOIN public.user_roles ur ON ur.ca_firm_id = c.ca_firm_id AND ur.user_id = _user_id
    WHERE c.id = _client_id AND ur.role = 'ca_owner'
  ) OR EXISTS(
    SELECT 1 FROM public.ca_staff_assignments a
    JOIN public.clients c ON c.id = a.client_id
    WHERE a.client_id = _client_id
      AND a.staff_user_id = _user_id
      AND a.ca_firm_id = c.ca_firm_id
  ) OR EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND client_id = _client_id
      AND role IN ('client_owner','client_employee')
  )
$function$;

-- 2. Prevent cross-firm staff assignments at insert time
DROP POLICY IF EXISTS ca_staff_insert ON public.ca_staff_assignments;
CREATE POLICY ca_staff_insert ON public.ca_staff_assignments
  FOR INSERT
  WITH CHECK (
    is_ca_owner(auth.uid(), ca_firm_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ca_staff_assignments.client_id
        AND c.ca_firm_id = ca_staff_assignments.ca_firm_id
    )
  );

-- 3. Tighten reminders policies to per-client access
DROP POLICY IF EXISTS reminders_select ON public.reminders;
DROP POLICY IF EXISTS reminders_insert ON public.reminders;
DROP POLICY IF EXISTS reminders_update ON public.reminders;
DROP POLICY IF EXISTS reminders_delete ON public.reminders;

CREATE POLICY reminders_select ON public.reminders
  FOR SELECT USING (
    is_ca_owner(auth.uid(), ca_firm_id) OR can_access_client(auth.uid(), client_id)
  );

CREATE POLICY reminders_insert ON public.reminders
  FOR INSERT WITH CHECK (
    is_ca_firm_member(auth.uid(), ca_firm_id)
    AND can_access_client(auth.uid(), client_id)
  );

CREATE POLICY reminders_update ON public.reminders
  FOR UPDATE USING (
    is_ca_owner(auth.uid(), ca_firm_id) OR can_access_client(auth.uid(), client_id)
  );

CREATE POLICY reminders_delete ON public.reminders
  FOR DELETE USING (is_ca_owner(auth.uid(), ca_firm_id));

-- 4. Revoke direct EXECUTE on internal SECURITY DEFINER helpers from API roles.
-- RLS policies still call these because policy evaluation runs as the table owner,
-- not the API role. This stops clients from invoking them via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_ca_firm_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_ca_owner(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
