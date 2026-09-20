
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
    )
  )
  from d;
$$;

grant execute on function public.dagsavslut_status(uuid, date) to authenticated;

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
    select s.id, s.name,
           (public.dagsavslut_status(s.id, _today) ->> 'dagsrapport_klar')::boolean as rapport_klar,
           (public.dagsavslut_status(s.id, _today) ->> 'inventering_klar')::boolean as inventering_klar
    from stores s
    where s.active is true
      and s.is_wholesale is false
      and s.name not ilike 'Administration%'
      and s.name not ilike 'Testbutik%'
  ), saknas as (
    select id, name,
           case
             when not rapport_klar and not inventering_klar then 'Dagsrapport och inventering saknas i dag'
             when not rapport_klar then 'Dagsrapport saknas i dag'
             else 'Inventering saknas i dag'
           end as text,
           case when not inventering_klar then '/inventory' else '/reports' end as sida
    from butiker
    where not rapport_klar or not inventering_klar
  ), rader as (
    select p.portal, x.id as store_id, x.name, x.text, x.sida,
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

select cron.unschedule('inventering-paminnelse-daglig')
where exists (select 1 from cron.job where jobname = 'inventering-paminnelse-daglig');

select cron.schedule('dagsavslut-paminnelse-daglig', '0 17 * * *', $$select public.inventering_paminnelse();$$);
