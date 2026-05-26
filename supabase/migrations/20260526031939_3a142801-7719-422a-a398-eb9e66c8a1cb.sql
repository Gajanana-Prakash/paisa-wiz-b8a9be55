
ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS subdomain_slug text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('firm-logos', 'firm-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "firm_logos_public_read" ON storage.objects;
CREATE POLICY "firm_logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'firm-logos');

DROP POLICY IF EXISTS "firm_logos_owner_insert" ON storage.objects;
CREATE POLICY "firm_logos_owner_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'firm-logos'
  AND public.is_ca_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "firm_logos_owner_update" ON storage.objects;
CREATE POLICY "firm_logos_owner_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'firm-logos'
  AND public.is_ca_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "firm_logos_owner_delete" ON storage.objects;
CREATE POLICY "firm_logos_owner_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'firm-logos'
  AND public.is_ca_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
