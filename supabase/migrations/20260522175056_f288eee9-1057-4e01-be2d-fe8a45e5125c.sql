
-- 1) Close the ca_owner self-grant privilege escalation
DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;

CREATE POLICY user_roles_insert ON public.user_roles
FOR INSERT
WITH CHECK (
  ca_firm_id IS NOT NULL
  AND public.is_ca_owner(auth.uid(), ca_firm_id)
);

-- 2) Rewrite invoices storage policies to use client membership.
-- Path layout: {ca_firm_id}/{client_id}/{filename}
DROP POLICY IF EXISTS invoices_storage_select_own ON storage.objects;
DROP POLICY IF EXISTS invoices_storage_insert_own ON storage.objects;
DROP POLICY IF EXISTS invoices_storage_update_own ON storage.objects;
DROP POLICY IF EXISTS invoices_storage_delete_own ON storage.objects;

CREATE POLICY invoices_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices'
  AND public.can_access_client(
    auth.uid(),
    NULLIF((storage.foldername(name))[2], '')::uuid
  )
);

CREATE POLICY invoices_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND public.can_access_client(
    auth.uid(),
    NULLIF((storage.foldername(name))[2], '')::uuid
  )
);

CREATE POLICY invoices_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoices'
  AND public.can_access_client(
    auth.uid(),
    NULLIF((storage.foldername(name))[2], '')::uuid
  )
);

CREATE POLICY invoices_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'invoices'
  AND public.can_access_client(
    auth.uid(),
    NULLIF((storage.foldername(name))[2], '')::uuid
  )
);
