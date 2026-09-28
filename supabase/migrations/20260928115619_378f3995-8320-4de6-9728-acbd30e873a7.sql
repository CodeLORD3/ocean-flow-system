alter table public.customers_retail
  add column if not exists consent_email boolean not null default false,
  add column if not exists consent_whatsapp boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_source text,
  add column if not exists home_store_id uuid references public.stores(id) on delete set null,
  add column if not exists segment text,
  add column if not exists purchases_90d integer,
  add column if not exists avg_purchase_90d numeric,
  add column if not exists segment_updated_at timestamptz;

alter table public.ai_utkast add column if not exists segment text;

create table if not exists public.customer_exports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  exported_by uuid default auth.uid(),
  exported_by_name text,
  format text not null check (format in ('shopify','whatsapp')),
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null
);
grant select, insert on public.customer_exports to authenticated;
grant all on public.customer_exports to service_role;
alter table public.customer_exports enable row level security;
create policy "Admin läser exporter" on public.customer_exports for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));
create policy "Admin loggar exporter" on public.customer_exports for insert to authenticated
  with check ((public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid())) and exported_by = auth.uid());

create or replace function public.refresh_customer_segments()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with o as (
    select customer_id,
      count(*) filter (where wanted_date >= current_date - 90) as k90,
      avg(coalesce(paid_total,total_incl_vat,estimated_total)) filter (where wanted_date >= current_date - 90) as avg90,
      count(*) as k_all
    from customer_orders
    where customer_id is not null and status <> 'avbruten' and wanted_date <= current_date
    group by customer_id
  )
  update customers_retail c set
    purchases_90d = coalesce(o.k90,0),
    avg_purchase_90d = round(o.avg90,2),
    segment = case when o.k90 >= 4 then 'Stamkund' when o.k90 between 2 and 3 then 'Återkommande'
                   when o.k90 = 1 then 'Ny' when coalesce(o.k_all,0) > 0 then 'Vilande' else null end,
    segment_updated_at = now()
  from customers_retail c2 left join o on o.customer_id = c2.id
  where c.id = c2.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.refresh_customer_segments() from public, anon, authenticated;

select cron.schedule('kundsegment-nattlig', '15 1 * * *', $$select public.refresh_customer_segments()$$);
select public.refresh_customer_segments();