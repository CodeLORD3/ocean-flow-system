-- Dagens avslut: kvitteringar ("inget att beställa" / "inget att köpa in")
-- samt utökad status och påminnelse för grossistbeställning och inköp.

create table if not exists public.dagsavslut_kvitteringar (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  dag date not null,
  vad text not null check (vad in ('grossist', 'inkop')),
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text,
  note text,
  created_at timestamptz not null default now(),
  unique (store_id, dag, vad)
);

grant select, insert, update, delete on public.dagsavslut_kvitteringar to authenticated;
grant all on public.dagsavslut_kvitteringar to service_role;

alter table public.dagsavslut_kvitteringar enable row level security;

create policy "Se kvitteringar för sina butiker"
on public.dagsavslut_kvitteringar
for select
to authenticated
using (public.can_see_store(store_id));

create policy "Kvittera för sina butiker"
on public.dagsavslut_kvitteringar
for insert
to authenticated
with check (public.can_see_store(store_id));

create policy "Ta bort egen kvittering"
on public.dagsavslut_kvitteringar
for delete
to authenticated
using (public.can_see_store(store_id));

create index if not exists dagsavslut_kvitteringar_store_dag_idx
  on public.dagsavslut_kvitteringar (store_id, dag);

-- Status för dagens avslut: fyra punkter i stället för två.
create or replace function public.dagsavslut_status(_store_id uuid, _day date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(_day, (now() at time zone 'Europe/Stockholm')::date) as dag)
  select jsonb_build_object(
    'dag', d.dag,
    'dagsrapport_klar', exists (
      select 1 from daily_reports r where r.store_id = _store_id and r.report_date = d.dag
    ),
    'inventering_klar', exists (
      select 1 from inventory_reports ir
      where ir.store_id = _store_id
        and ir.approved_at is not null
        and (ir.reported_at at time zone 'Europe/Stockholm')::date = d.dag
    ) or exists (
      select 1 from daily_stock_sheets ds
      where ds.store_id = _store_id
        and ds.location_id is null
        and ds.status = 'godkand'
        and ds.sheet_date = d.dag
    ),
    'grossistorder_klar', exists (
      select 1 from store_replenishment_orders o
      where o.store_id = _store_id
        and o.sent_at is not null
        and o.cancelled_at is null
        and (o.wanted_date >= d.dag or (o.created_at at time zone 'Europe/Stockholm')::date = d.dag)
    ) or exists (
      select 1 from dagsavslut_kvitteringar k
      where k.store_id = _store_id and k.dag = d.dag and k.vad = 'grossist'
    ),
    'inkop_klar', exists (
      select 1 from purchase_report_lines l
      where l.purchase_date = d.dag
    ) or exists (
      select 1 from dagsavslut_kvitteringar k
      where k.store_id = _store_id and k.dag = d.dag and k.vad = 'inkop'
    )
  )
  from d;
$$;

-- Påminnelsen täcker nu även beställning till grossisten och inköp.
create or replace function public.inventering_paminnelse()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _today date := (now() at time zone 'Europe/Stockholm')::date;
  _n integer := 0;
begin
  with butiker as (
    select s.id, s.name, public.dagsavslut_status(s.id, _today) as st
    from stores s
    where s.active is true
      and s.is_wholesale is false
      and s.name not ilike 'Administration%'
      and s.name not ilike 'Testbutik%'
  ), flagg as (
    select id, name,
           (st ->> 'dagsrapport_klar')::boolean as rapport_klar,
           (st ->> 'inventering_klar')::boolean as inventering_klar,
           coalesce((st ->> 'grossistorder_klar')::boolean, true) as grossist_klar,
           coalesce((st ->> 'inkop_klar')::boolean, true) as inkop_klar
    from butiker
  ), saknas as (
    select id, name,
           array_to_string(
             array_remove(array[
               case when not rapport_klar then 'dagsrapport' end,
               case when not inventering_klar then 'inventering' end,
               case when not grossist_klar then 'beställning till grossisten' end,
               case when not inkop_klar then 'inköp' end
             ], null), ', ') as lista,
           case
             when not inventering_klar then '/inventory'
             when not rapport_klar then '/reports'
             when not grossist_klar then '/butiksorder'
             else '/inkopsschema'
           end as sida
    from flagg
    where not rapport_klar or not inventering_klar or not grossist_klar or not inkop_klar
  ), rader as (
    select p.portal, x.id as store_id, x.name,
           'Kvar i dag: ' || x.lista as text, x.sida,
           'dagsavslut-saknas-' || x.id::text || '-' || _today::text || '-' || p.portal as dedupe_key
    from saknas x
    cross join (values ('shop'), ('wholesale')) as p(portal)
  )
  insert into notifications (portal, target_page, store_id, message, entity_type, entity_id, dedupe_key)
  select r.portal, r.sida, r.store_id, r.text || ' — ' || r.name, 'dagsavslut', r.store_id::text, r.dedupe_key
  from rader r
  where not exists (select 1 from notifications n where n.dedupe_key = r.dedupe_key);

  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Påminnelsen skapas tre gånger under dagen i stället för bara på kvällen.
select cron.unschedule('dagsavslut-paminnelse-daglig')
where exists (select 1 from cron.job where jobname = 'dagsavslut-paminnelse-daglig');

select cron.schedule(
  'dagsavslut-paminnelse-daglig',
  '0 6,10,16 * * *',
  $$select public.inventering_paminnelse();$$
);