-- Nya kolumner: butik på inköpsrapport och rad
alter table public.purchase_reports add column if not exists store_id uuid references public.stores(id);
alter table public.purchase_report_lines add column if not exists store_id uuid references public.stores(id);
create index if not exists purchase_reports_store_idx on public.purchase_reports(store_id);
create index if not exists purchase_report_lines_store_idx on public.purchase_report_lines(store_id);

create table public.staff_cost_rates (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id text not null references public.legal_entities(legal_entity_id),
  store_id uuid references public.stores(id) on delete cascade,
  cost_per_hour numeric not null check (cost_per_hour >= 0),
  valid_from date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.store_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cost_type text not null,
  amount_per_month numeric not null check (amount_per_month >= 0),
  currency text not null default 'SEK',
  valid_from date not null,
  valid_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create table public.store_budget (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  sales numeric, raw_material numeric, staff numeric, rent numeric, other numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, year, month)
);

grant select, insert, update, delete on public.staff_cost_rates, public.store_fixed_costs, public.store_budget to authenticated;
grant all on public.staff_cost_rates, public.store_fixed_costs, public.store_budget to service_role;
alter table public.staff_cost_rates enable row level security;
alter table public.store_fixed_costs enable row level security;
alter table public.store_budget enable row level security;
create policy "staff_cost_rates admin" on public.staff_cost_rates for all to authenticated
  using (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()))
  with check (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()));
create policy "store_fixed_costs admin" on public.store_fixed_costs for all to authenticated
  using (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()))
  with check (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()));
create policy "store_budget admin" on public.store_budget for all to authenticated
  using (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()))
  with check (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid()));

create or replace function public.touch_updated_at_generic() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger staff_cost_rates_touch before update on public.staff_cost_rates for each row execute function public.touch_updated_at_generic();
create trigger store_fixed_costs_touch before update on public.store_fixed_costs for each row execute function public.touch_updated_at_generic();
create trigger store_budget_touch before update on public.store_budget for each row execute function public.touch_updated_at_generic();

-- Resultat per butik och månad. NULL = indata saknas (visas som "saknas").
create or replace function public.resultat_per_butik(_from date, _to date)
returns table(
  legal_entity_id text, store_id uuid, store_name text, month date,
  sales_sek numeric, sales_days int,
  raw_purchase_sek numeric, raw_ic_sek numeric,
  staff_hours numeric, staff_cost_sek numeric, staff_hours_without_rate numeric,
  fixed_cost_sek numeric,
  budget_sales numeric, budget_raw numeric, budget_staff numeric, budget_rent numeric, budget_other numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid())) then
    raise exception 'Endast administratörer';
  end if;
  return query
  with months as (
    select generate_series(date_trunc('month', _from)::date, date_trunc('month', _to)::date, interval '1 month')::date m
  ),
  st as (select s.id, s.name, s.legal_entity_id from stores s where s.active and s.legal_entity_id is not null),
  sales as (
    select r.store_id, date_trunc('month', r.report_date)::date m,
           sum(r.net_sales * case when coalesce(r.currency,'SEK') = 'SEK' then 1 else fx_to_sek(r.currency, r.report_date) end) v,
           count(*) filter (where r.net_sales is not null)::int n
    from daily_reports r where r.report_date between _from and _to and r.net_sales is not null group by 1,2
  ),
  pur as (
    select coalesce(l.store_id, p.store_id) sid, date_trunc('month', coalesce(l.purchase_date, p.document_date, p.report_date, p.created_at::date))::date m,
           sum(l.line_total) v
    from purchase_report_lines l join purchase_reports p on p.id = l.report_id
    where coalesce(l.store_id, p.store_id) is not null and p.archived_at is null
      and coalesce(l.purchase_date, p.document_date, p.report_date, p.created_at::date) between _from and _to
    group by 1,2
  ),
  ic as (
    select sl.store_id sid, date_trunc('month', i.created_at)::date m,
           sum(i.amount_ex_vat * case when coalesce(i.currency,'SEK')='SEK' then 1 else fx_to_sek(i.currency, i.created_at::date) end) v
    from intercompany_invoices i join transfer_orders t on t.id = i.transfer_order_id
    join storage_locations sl on sl.id = t.to_location_id
    where i.created_at::date between _from and _to and coalesce(i.status,'') <> 'makulerad'
    group by 1,2
  ),
  hrs as (
    select e.effective_store_id sid, date_trunc('month', e.work_date)::date m, e.work_date, sum(e.hours) h
    from pk_logged_times_effective e
    where e.work_date between _from and _to and not coalesce(e.is_canceled,false) and e.effective_store_id is not null
    group by 1,2,3
  ),
  hrs_cost as (
    select h.sid, h.m, sum(h.h) h,
           sum(h.h * rate.c) c,
           sum(case when rate.c is null then h.h else 0 end) no_rate
    from hrs h join st on st.id = h.sid
    left join lateral (
      select r.cost_per_hour c from staff_cost_rates r
      where r.legal_entity_id = st.legal_entity_id and (r.store_id = h.sid or r.store_id is null) and r.valid_from <= h.work_date
      order by (r.store_id is not null) desc, r.valid_from desc limit 1) rate on true
    group by 1,2
  ),
  fx as (
    select f.store_id sid, mo.m,
           sum(f.amount_per_month * case when f.currency='SEK' then 1 else fx_to_sek(f.currency, mo.m) end) v
    from store_fixed_costs f join months mo
      on f.valid_from <= (mo.m + interval '1 month - 1 day')::date and (f.valid_to is null or f.valid_to >= mo.m)
    group by 1,2
  )
  select st.legal_entity_id, st.id, st.name, mo.m,
         sales.v, coalesce(sales.n,0),
         pur.v, ic.v,
         hc.h, case when hc.h is null or hc.no_rate > 0 then null else hc.c end, hc.no_rate,
         fx.v,
         b.sales, b.raw_material, b.staff, b.rent, b.other
  from st cross join months mo
  left join sales on sales.store_id = st.id and sales.m = mo.m
  left join pur on pur.sid = st.id and pur.m = mo.m
  left join ic on ic.sid = st.id and ic.m = mo.m
  left join hrs_cost hc on hc.sid = st.id and hc.m = mo.m
  left join fx on fx.sid = st.id and fx.m = mo.m
  left join store_budget b on b.store_id = st.id and b.year = extract(year from mo.m) and b.month = extract(month from mo.m)
  order by st.legal_entity_id, st.name, mo.m;
end $$;

-- Bokfört utfall ur Fortnox per bolag, månad och kostnadsställe (BAS-klasser).
create or replace function public.resultat_bokfort(_from date, _to date)
returns table(legal_entity_code text, month date, cost_center text,
              revenue numeric, raw_material numeric, other_external numeric, staff numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'admin'::app_role) or is_platform_admin(auth.uid())) then
    raise exception 'Endast administratörer';
  end if;
  return query
  select b.legal_entity_code, b.period, nullif(b.cost_center,''),
         -sum(b.balance) filter (where b.account like '3%'),
          sum(b.balance) filter (where b.account like '4%'),
          sum(b.balance) filter (where b.account like '5%' or b.account like '6%'),
          sum(b.balance) filter (where b.account like '7%')
  from fortnox_account_balances b
  where b.period between date_trunc('month', _from)::date and _to and b.account ~ '^[3-7]'
  group by 1,2,3 order by 1,2,3;
end $$;

revoke execute on function public.resultat_per_butik(date,date), public.resultat_bokfort(date,date) from public, anon;
grant execute on function public.resultat_per_butik(date,date), public.resultat_bokfort(date,date) to authenticated;