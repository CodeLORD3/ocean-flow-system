
create table public.fortnox_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  legal_entity_code text not null,
  given_number text not null,
  supplier_number text,
  supplier_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  total numeric,
  balance numeric,
  currency text,
  paid boolean not null default false,
  cancelled boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (legal_entity_code, given_number)
);
grant select on public.fortnox_supplier_invoices to authenticated;
grant all on public.fortnox_supplier_invoices to service_role;
alter table public.fortnox_supplier_invoices enable row level security;
create policy "Admin läser leverantörsfakturor" on public.fortnox_supplier_invoices for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.tax_calendar (
  id uuid primary key default gen_random_uuid(),
  legal_entity_code text not null,
  tax_type text not null,
  due_date date not null,
  amount numeric not null,
  estimated boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tax_calendar to authenticated;
grant all on public.tax_calendar to service_role;
alter table public.tax_calendar enable row level security;
create policy "Admin hanterar skattekalender" on public.tax_calendar for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.bank_balances (
  id uuid primary key default gen_random_uuid(),
  legal_entity_code text not null,
  balance_date date not null,
  balance numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_code, balance_date)
);
grant select, insert, update, delete on public.bank_balances to authenticated;
grant all on public.bank_balances to service_role;
alter table public.bank_balances enable row level security;
create policy "Admin hanterar banksaldon" on public.bank_balances for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.likv_touch() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at := now(); return new; end $$;
create trigger tax_calendar_touch before update on public.tax_calendar for each row execute function public.likv_touch();
create trigger bank_balances_touch before update on public.bank_balances for each row execute function public.likv_touch();

create or replace function public.likviditet_veckor(_entity text, _start date)
returns table(week_start date, direction text, category text, amount numeric, quality text, note text)
language plpgsql stable security definer set search_path = public as $$
declare
  _w0 date := date_trunc('week', _start)::date;
  _end date := _w0 + 91;
  _hist_from date := current_date - 28;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Endast administratörer'; end if;

  -- Kundfakturor (Fortnox) efter förfallodatum; förfallna läggs i första veckan.
  return query
  select greatest(date_trunc('week', j.final_pay_date)::date, _w0), 'in', 'Kundfakturor',
         sum(coalesce(j.fortnox_balance, j.fortnox_total)), 'fakta',
         count(*)::text || ' fakturor' || case when bool_or(j.final_pay_date < _w0) then ', varav förfallna' else '' end
  from fortnox_invoice_jobs j
  where j.legal_entity_code = _entity and j.fortnox_document_number is not null
    and coalesce(j.fortnox_cancelled,false) = false and j.status not in ('paid','cancelled')
    and coalesce(j.fortnox_balance, j.fortnox_total, 0) > 0
    and j.final_pay_date is not null and j.final_pay_date < _end
  group by 1;
  return query
  select _w0, 'in', 'Kundfakturor utan förfallodatum', sum(coalesce(j.fortnox_total, 0)), 'saknas', count(*)::text || ' fakturor'
  from fortnox_invoice_jobs j
  where j.legal_entity_code = _entity and j.fortnox_document_number is not null
    and j.status not in ('paid','cancelled') and coalesce(j.fortnox_cancelled,false) = false
    and j.final_pay_date is null
  having count(*) > 0;

  -- Shopify: skattning ur ordrar senaste fyra veckorna.
  return query
  with s as (
    select sum(coalesce(o.paid_total, o.total_incl_vat, o.estimated_total, 0)) / 4.0 as per_week, count(*) n
    from customer_orders o join stores st on st.id = o.store_id
    where o.source = 'shopify' and st.legal_entity_id = _entity and o.created_at >= _hist_from
  )
  select _w0 + 7*g, 'in', 'Shopify-utbetalningar', s.per_week, 'skattning', 'snitt ' || s.n || ' ordrar senaste 4 v, utbetalningsdata saknas'
  from s, generate_series(0,12) g where s.n > 0;

  -- Kassaförsäljning: snitt per veckodag senaste 4 veckor × öppna dagar.
  return query
  with hist as (
    select d.store_id, extract(isodow from d.report_date)::int dow, avg(coalesce(d.gross_sales, d.pos_gross_sales, d.net_sales)) snitt
    from daily_reports d join stores st on st.id = d.store_id
    where st.legal_entity_id = _entity and st.active and d.report_date >= _hist_from and d.report_date < current_date
    group by 1, 2
  ), days as (
    select st.id store_id, dd::date dag
    from stores st, generate_series(_w0, _end - 1, interval '1 day') dd
    where st.legal_entity_id = _entity and st.active and dd::date >= current_date
      and not exists (select 1 from store_closed_days c where c.store_id = st.id and c.date = dd::date)
      and not exists (select 1 from store_opening_hours h where h.store_id = st.id and h.weekday = extract(isodow from dd)::int % 7 and h.closed)
  )
  select date_trunc('week', days.dag)::date, 'in', 'Kassaförsäljning', sum(hist.snitt), 'skattning', 'snitt per veckodag senaste 4 v × öppna dagar'
  from days join hist on hist.store_id = days.store_id and hist.dow = extract(isodow from days.dag)::int
  group by 1;

  -- Leverantörsfakturor.
  return query
  select greatest(date_trunc('week', f.due_date)::date, _w0), 'ut', 'Leverantörsfakturor', sum(f.balance), 'fakta',
         count(*)::text || ' fakturor' || case when bool_or(f.due_date < _w0) then ', varav förfallna' else '' end
  from fortnox_supplier_invoices f
  where f.legal_entity_code = _entity and not f.paid and not f.cancelled and f.balance > 0
    and coalesce(f.due_date, _w0) < _end
  group by 1;

  -- Löner den 25:e: lönerader om de finns, annars timmar × timkostnad.
  return query
  with pay_days as (
    select make_date(extract(year from m)::int, extract(month from m)::int, 25) d
    from generate_series(date_trunc('month', _w0), date_trunc('month', _end), interval '1 month') m
  ), lines as (
    select pp.period_end, sum(pl.quantity * pl.unit_amount) belopp
    from payroll_periods pp join payroll_lines pl on pl.period_id = pp.id
    where pp.legal_entity_id = _entity group by 1
  ), hrs as (
    select e.effective_store_id store_id, sum(e.hours) * 30.44 / 28.0 h
    from pk_logged_times_effective e join stores st on st.id = e.effective_store_id
    where st.legal_entity_id = _entity and not coalesce(e.is_canceled,false) and e.work_date >= _hist_from
    group by 1
  ), est as (
    select sum(hrs.h * r.cost_per_hour) belopp, count(*) filter (where r.cost_per_hour is null) utan, sum(hrs.h) h
    from hrs left join lateral (
      select c.cost_per_hour from staff_cost_rates c
      where c.legal_entity_id = _entity and (c.store_id = hrs.store_id or c.store_id is null) and c.valid_from <= current_date
      order by (c.store_id is null), c.valid_from desc limit 1) r on true
  )
  select date_trunc('week', p.d)::date, 'ut', 'Löner',
         coalesce(l.belopp, case when est.utan = 0 then est.belopp end),
         case when l.belopp is not null then 'fakta' when est.h > 0 and est.utan = 0 then 'skattning' else 'saknas' end,
         case when l.belopp is not null then 'lönerader'
              when est.h is null or est.h = 0 then 'inga timmar senaste 4 v'
              when est.utan > 0 then round(est.h)::text || ' h/mån men timkostnad saknas'
              else round(est.h)::text || ' h/mån × timkostnad' end
  from pay_days p cross join est
  left join lines l on date_trunc('month', l.period_end) = date_trunc('month', p.d)
  where p.d >= _w0 and p.d < _end;

  -- Hyror och fasta kostnader den 1:a varje månad.
  return query
  select date_trunc('week', m)::date, 'ut', 'Hyra och fasta kostnader', sum(fc.amount_per_month), 'fakta', 'förfaller antaget den 1:a'
  from generate_series(date_trunc('month', _w0), _end, interval '1 month') m
  join store_fixed_costs fc on fc.valid_from <= m::date and (fc.valid_to is null or fc.valid_to >= m::date)
  join stores st on st.id = fc.store_id and st.legal_entity_id = _entity
  where m::date >= _w0 and m::date < _end
  group by 1;
  return query
  select _w0, 'ut', 'Hyra och fasta kostnader', null::numeric, 'saknas', 'inga fasta kostnader registrerade'
  where not exists (select 1 from store_fixed_costs fc join stores st on st.id = fc.store_id where st.legal_entity_id = _entity);

  -- Moms och skatt.
  return query
  select greatest(date_trunc('week', t.due_date)::date, _w0), 'ut', 'Moms och skatt: ' || t.tax_type, sum(t.amount),
         case when bool_or(t.estimated) then 'skattning' else 'fakta' end, null::text
  from tax_calendar t where t.legal_entity_code = _entity and t.due_date < _end and t.due_date >= _w0 - 7
  group by 1, t.tax_type;
  return query
  select _w0, 'ut', 'Moms och skatt', null::numeric, 'saknas', 'skattekalendern är tom för perioden'
  where not exists (select 1 from tax_calendar t where t.legal_entity_code = _entity and t.due_date >= _w0 and t.due_date < _end);
end $$;
revoke all on function public.likviditet_veckor(text, date) from public, anon;
grant execute on function public.likviditet_veckor(text, date) to authenticated;
