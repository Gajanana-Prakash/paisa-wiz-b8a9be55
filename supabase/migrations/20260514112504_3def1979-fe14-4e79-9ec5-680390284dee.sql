
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  gstin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- INVOICES
create type public.invoice_status as enum ('uploaded','processing','review','validated','error');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text,
  file_name text,
  status public.invoice_status not null default 'uploaded',
  vendor_name text,
  vendor_gstin text,
  buyer_name text,
  buyer_gstin text,
  invoice_number text,
  invoice_date date,
  due_date date,
  place_of_supply text,
  taxable_value numeric(14,2) default 0,
  cgst numeric(14,2) default 0,
  sgst numeric(14,2) default 0,
  igst numeric(14,2) default 0,
  cess numeric(14,2) default 0,
  total_amount numeric(14,2) default 0,
  currency text default 'INR',
  raw_extraction jsonb,
  validation_flags jsonb default '[]'::jsonb,
  confidence numeric(4,3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoices enable row level security;

create index invoices_user_idx on public.invoices(user_id, created_at desc);
create index invoices_gstin_idx on public.invoices(vendor_gstin);
create index invoices_number_idx on public.invoices(invoice_number);

create policy "invoices_select_own" on public.invoices for select using (auth.uid() = user_id);
create policy "invoices_insert_own" on public.invoices for insert with check (auth.uid() = user_id);
create policy "invoices_update_own" on public.invoices for update using (auth.uid() = user_id);
create policy "invoices_delete_own" on public.invoices for delete using (auth.uid() = user_id);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute procedure public.set_updated_at();

-- INVOICE ITEMS
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  hsn text,
  quantity numeric(14,3) default 1,
  unit_price numeric(14,2) default 0,
  taxable_value numeric(14,2) default 0,
  gst_rate numeric(5,2) default 0,
  gst_amount numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
alter table public.invoice_items enable row level security;
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create policy "invoice_items_select_own" on public.invoice_items for select
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));
create policy "invoice_items_insert_own" on public.invoice_items for insert
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));
create policy "invoice_items_update_own" on public.invoice_items for update
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));
create policy "invoice_items_delete_own" on public.invoice_items for delete
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));

-- STORAGE
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices_storage_select_own" on storage.objects for select
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoices_storage_insert_own" on storage.objects for insert
  with check (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoices_storage_update_own" on storage.objects for update
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "invoices_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
