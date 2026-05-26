ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'approved';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;