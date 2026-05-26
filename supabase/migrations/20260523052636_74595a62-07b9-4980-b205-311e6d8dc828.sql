
CREATE TYPE public.document_category AS ENUM ('sales_invoice','purchase_bill','expense_receipt','bank_statement','asset_purchase','other');
ALTER TABLE public.invoices ADD COLUMN document_category public.document_category;
ALTER TABLE public.invoices ADD COLUMN category_confidence numeric;
CREATE INDEX invoices_category_idx ON public.invoices(document_category);
