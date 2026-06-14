ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS existing_tax_software TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS practicedesk_info_dismissed_at TIMESTAMPTZ;