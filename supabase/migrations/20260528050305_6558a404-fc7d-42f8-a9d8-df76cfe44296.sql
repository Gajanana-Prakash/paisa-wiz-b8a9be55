
-- 1. Public SELECT for firm-logos (bucket is public for branding)
CREATE POLICY firm_logos_public_read
ON storage.objects FOR SELECT
USING (bucket_id = 'firm-logos');

-- 2. Task attachments UPDATE policy (parity with insert/delete)
CREATE POLICY task_attachments_update
ON storage.objects FOR UPDATE
USING (bucket_id = 'task-attachments' AND is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'task-attachments' AND is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 3. Lock down SECURITY DEFINER helper functions so only the SQL engine (postgres role, RLS, triggers) can invoke them
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ca_firm_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ca_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
