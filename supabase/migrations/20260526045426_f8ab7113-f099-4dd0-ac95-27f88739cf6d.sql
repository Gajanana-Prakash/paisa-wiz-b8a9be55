
-- 1) Restrict reminder_rules UPDATE/DELETE: owners always, staff only their own
DROP POLICY IF EXISTS reminder_rules_update ON public.reminder_rules;
DROP POLICY IF EXISTS reminder_rules_delete ON public.reminder_rules;

CREATE POLICY reminder_rules_update ON public.reminder_rules
  FOR UPDATE
  USING (
    public.is_ca_owner(auth.uid(), ca_firm_id)
    OR (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND created_by = auth.uid())
  );

CREATE POLICY reminder_rules_delete ON public.reminder_rules
  FOR DELETE
  USING (
    public.is_ca_owner(auth.uid(), ca_firm_id)
    OR (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND created_by = auth.uid())
  );

-- 2) Stop listing of firm-logos bucket. Public bucket still serves files
--    over direct URLs; the SELECT policy on storage.objects is only needed
--    to enumerate, which we do not require.
DROP POLICY IF EXISTS firm_logos_public_read ON storage.objects;
