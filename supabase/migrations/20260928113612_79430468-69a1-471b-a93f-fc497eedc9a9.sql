
alter table public.price_history
  add column if not exists sku text,
  add column if not exists old_price numeric,
  add column if not exists new_price numeric,
  add column if not exists valid_from date,
  add column if not exists source_ai_utkast_id bigint,
  add column if not exists publish_status text,
  add column if not exists published_at timestamptz;
create index if not exists price_history_queue_idx on public.price_history (publish_status, valid_from) where publish_status = 'köad';

create table public.price_publish_log (
  id uuid primary key default gen_random_uuid(),
  price_history_id uuid references public.price_history(id) on delete set null,
  ai_utkast_id bigint,
  sku text,
  target text not null,
  status text not null,
  request jsonb,
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);
grant select on public.price_publish_log to authenticated;
grant all on public.price_publish_log to service_role;
alter table public.price_publish_log enable row level security;
create policy "Admin läser prispubliceringslogg" on public.price_publish_log for select to authenticated using (public.has_role(auth.uid(),'admin'));
