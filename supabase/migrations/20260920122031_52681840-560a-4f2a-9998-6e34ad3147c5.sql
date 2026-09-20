create or replace function public.inventering_paminnelse()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _today date := (now() at time zone 'Europe/Stockholm')::date;
  _week_start date := date_trunc('week', (now() at time zone 'Europe/Stockholm'))::date;
  _n integer := 0;
begin
  with saknas as (
    select s.id, s.name
    from stores s
    where s.active is true
      and s.is_wholesale is false
      and s.name not ilike 'Administration%'
      and s.name not ilike 'Testbutik%'
      and not exists (
        select 1 from inventory_reports r
        where r.store_id = s.id
          and r.approved_at is not null
          and (r.reported_at at time zone 'Europe/Stockholm')::date >= _week_start
      )
      and not exists (
        select 1 from daily_stock_sheets d
        where d.store_id = s.id
          and d.location_id is null
          and d.status = 'godkand'
          and d.sheet_date >= _week_start
      )
  ), rader as (
    select p.portal, x.id as store_id, x.name,
           'inventering-saknas-' || x.id::text || '-' || _today::text || '-' || p.portal as dedupe_key
    from saknas x
    cross join (values ('shop'), ('wholesale')) as p(portal)
  )
  insert into notifications (portal, target_page, store_id, message, entity_type, entity_id, dedupe_key)
  select r.portal,
         '/inventory',
         r.store_id,
         'Inventering saknas denna vecka — ' || r.name,
         'inventering',
         r.store_id::text,
         r.dedupe_key
  from rader r
  where not exists (
    select 1 from notifications n where n.dedupe_key = r.dedupe_key
  );

  get diagnostics _n = row_count;
  return _n;
end;
$$;