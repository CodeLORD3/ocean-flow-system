-- 1. pos_transactions: källa och externa fält
alter table public.pos_transactions
  add column if not exists source text not null default 'internal',
  add column if not exists external_id text,
  add column if not exists external_receipt_no text,
  add column if not exists external_register text,
  add column if not exists external_cashier text;

alter table public.pos_transactions alter column cashier_id drop not null;

create unique index if not exists pos_transactions_source_external_uidx
  on public.pos_transactions (source, external_id) where external_id is not null;
create index if not exists pos_transactions_store_occurred_idx
  on public.pos_transactions (store_id, occurred_at desc);

alter table public.pos_transaction_items
  add column if not exists external_line_no integer,
  add column if not exists barcode text;

-- 2. Råhändelser
create table if not exists public.nimpos_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null default 'sale.completed',
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  transaction_id uuid references public.pos_transactions(id) on delete set null,
  store_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
grant select on public.nimpos_webhook_events to authenticated;
grant all on public.nimpos_webhook_events to service_role;
alter table public.nimpos_webhook_events enable row level security;
create policy "Staff can read nimpos events" on public.nimpos_webhook_events
  for select to authenticated using (public.is_staff());

-- 3. Butikskoppling
create table if not exists public.nimpos_store_map (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  register_id text,
  store_id uuid not null references public.stores(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.nimpos_store_map to authenticated;
grant all on public.nimpos_store_map to service_role;
alter table public.nimpos_store_map enable row level security;
create policy "Staff can read nimpos store map" on public.nimpos_store_map
  for select to authenticated using (public.is_staff());
create policy "Managers manage nimpos store map" on public.nimpos_store_map
  for all to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());
create trigger nimpos_store_map_updated_at before update on public.nimpos_store_map
  for each row execute function public.set_updated_at();

-- 4. Produktkoppling
create table if not exists public.nimpos_product_map (
  id uuid primary key default gen_random_uuid(),
  external_sku text,
  barcode text,
  external_name text,
  product_id uuid references public.products(id) on delete set null,
  unmatched_count integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nimpos_product_map_sku_uidx on public.nimpos_product_map (external_sku) where external_sku is not null;
create unique index if not exists nimpos_product_map_barcode_uidx on public.nimpos_product_map (barcode) where barcode is not null;
grant select, insert, update, delete on public.nimpos_product_map to authenticated;
grant all on public.nimpos_product_map to service_role;
alter table public.nimpos_product_map enable row level security;
create policy "Staff can read nimpos product map" on public.nimpos_product_map
  for select to authenticated using (public.is_staff());
create policy "Managers manage nimpos product map" on public.nimpos_product_map
  for all to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());
create trigger nimpos_product_map_updated_at before update on public.nimpos_product_map
  for each row execute function public.set_updated_at();

-- 5. Stängningsrapport: kassafält
alter table public.daily_reports
  add column if not exists pos_gross_sales numeric(12,2),
  add column if not exists pos_net_sales numeric(12,2),
  add column if not exists pos_receipt_count integer,
  add column if not exists pos_largest_sale numeric(12,2),
  add column if not exists pos_payments jsonb not null default '[]'::jsonb,
  add column if not exists pos_vat_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists pos_snapshot_at timestamptz,
  add column if not exists pos_source text;

-- 6. Aggregat: en butiksdag
create or replace function public.pos_day_summary(_store_id uuid, _date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select * from public.pos_transactions t
    where t.store_id = _store_id
      and t.parked = false
      and (t.occurred_at at time zone 'Europe/Stockholm')::date = _date
  ),
  sales as (select * from tx where status = 'completed'),
  pay as (
    select coalesce(p->>'method', t.payment_method) as method,
           sum(coalesce((p->>'amount_ore')::numeric, t.total_ore)) as amount_ore
    from sales t
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(t.payment_details) = 'array' then t.payment_details else '[]'::jsonb end
    ) p on true
    group by 1
  ),
  vat as (
    select (v->>'rate')::numeric as rate,
           sum(coalesce((v->>'vat_ore')::numeric, 0)) as vat_ore,
           sum(coalesce((v->>'net_ore')::numeric, 0)) as net_ore
    from sales t
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(t.vat_breakdown) = 'array' then t.vat_breakdown else '[]'::jsonb end
    ) v on true
    where v is not null
    group by 1
  ),
  top as (
    select i.product_name, sum(i.quantity) as qty, sum(i.line_total_ore)/100.0 as amount
    from public.pos_transaction_items i
    join sales t on t.id = i.transaction_id
    group by 1 order by 3 desc limit 10
  )
  select jsonb_build_object(
    'store_id', _store_id,
    'date', _date,
    'gross_sales', coalesce((select sum(total_ore) from sales), 0) / 100.0,
    'vat_total', coalesce((select sum(vat_ore) from vat), 0) / 100.0,
    'net_sales', case
        when coalesce((select sum(vat_ore) from vat), 0) > 0
          then (coalesce((select sum(total_ore) from sales), 0) - (select sum(vat_ore) from vat)) / 100.0
        else round(coalesce((select sum(total_ore) from sales), 0) / 112.0, 2)
      end,
    'receipt_count', (select count(*) from sales where total_ore >= 0),
    'return_count', (select count(*) from tx where status <> 'completed' or total_ore < 0),
    'largest_sale', coalesce((select max(total_ore) from sales where total_ore > 0), 0) / 100.0,
    'avg_receipt', case when (select count(*) from sales where total_ore >= 0) > 0
        then round(coalesce((select sum(total_ore) from sales), 0) / 100.0 / (select count(*) from sales where total_ore >= 0), 2)
        else 0 end,
    'last_receipt_at', (select max(occurred_at) from tx),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount_ore/100.0) order by amount_ore desc) from pay where method is not null), '[]'::jsonb),
    'vat_breakdown', coalesce((select jsonb_agg(jsonb_build_object('rate', rate, 'vat', vat_ore/100.0, 'net', net_ore/100.0) order by rate) from vat where rate is not null), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object('name', product_name, 'qty', qty, 'amount', amount)) from top), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(distinct source) from tx), '[]'::jsonb)
  )
$$;
revoke all on function public.pos_day_summary(uuid, date) from public;
grant execute on function public.pos_day_summary(uuid, date) to authenticated, service_role;

-- 7. Aggregat: livevyn (alla butiker, en dag)
create or replace function public.pos_live_summary(_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with per_store as (
    select s.id, s.name,
           public.pos_day_summary(s.id, _date) as sum
    from public.stores s
    where s.active is not false and s.is_wholesale is not true
  ),
  hours as (
    select extract(hour from (t.occurred_at at time zone 'Europe/Stockholm'))::int as h,
           sum(t.total_ore)/100.0 as amount,
           count(*) as receipts
    from public.pos_transactions t
    where t.parked = false and t.status = 'completed'
      and (t.occurred_at at time zone 'Europe/Stockholm')::date = _date
    group by 1
  )
  select jsonb_build_object(
    'date', _date,
    'stores', coalesce((select jsonb_agg(jsonb_build_object('store_id', id, 'name', name, 'summary', sum) order by name) from per_store), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'amount', amount, 'receipts', receipts) order by h) from hours), '[]'::jsonb),
    'ops', jsonb_build_object(
      'failed', (select count(*) from public.nimpos_webhook_events where status = 'failed'),
      'unmapped', (select count(*) from public.nimpos_webhook_events where status = 'unmapped_store'),
      'pending', (select count(*) from public.nimpos_webhook_events where status = 'pending'),
      'unmatched_products', (select count(*) from public.nimpos_product_map where product_id is null)
    )
  )
$$;
revoke all on function public.pos_live_summary(date) from public;
grant execute on function public.pos_live_summary(date) to authenticated, service_role;

-- 8. Realtime för livevyn
alter table public.pos_transactions replica identity full;
do $$ begin
  execute 'alter publication supabase_realtime add table public.pos_transactions';
exception when duplicate_object then null; end $$;