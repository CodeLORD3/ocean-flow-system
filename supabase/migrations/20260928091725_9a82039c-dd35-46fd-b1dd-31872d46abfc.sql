-- 1. Kassans siffror in i dagsrapporten när avstämningen är klar.
create or replace function public.daily_report_fill_pos(_store_id uuid, _day date)
returns text language plpgsql security definer set search_path = public as $$
declare
  _rep daily_reports;
  _src text;
  _g numeric; _n int; _max numeric; _vat jsonb; _vat_sum numeric; _pay jsonb;
begin
  select * into _rep from daily_reports where store_id = _store_id and report_date = _day;
  if _rep.id is null then return null; end if;
  if coalesce(_rep.pos_source,'') ilike 'Z-rapport%' then return null; end if;

  if exists (select 1 from nimpos_reconciliations r where r.store_id = _store_id and r.business_date = _day and r.status in ('ok','efterhamtad')) then
    _src := 'Nimpos (avstämd)';
  elsif exists (select 1 from sumup_reconciliations r join sumup_merchants m on m.merchant_code = r.merchant_code
                where m.store_id = _store_id and r.recon_date = _day and r.status = 'ok') then
    _src := 'SumUp (avstämd)';
  elsif exists (select 1 from sumup_merchants m where m.store_id = _store_id)
        and not exists (select 1 from sumup_reconciliations r join sumup_merchants m on m.merchant_code = r.merchant_code
                        where m.store_id = _store_id and r.recon_date = _day) then
    -- Dagar före SumUp-avstämningen startade: kassans kvitton utan avstämning.
    _src := 'SumUp (ej avstämd)';
  else
    return null;
  end if;

  with tx as (
    select * from pos_transactions t
    where t.store_id = _store_id and t.status = 'completed' and coalesce(t.test_mode,false) = false
      and (t.occurred_at at time zone 'Europe/Stockholm')::date = _day
  )
  select sum(total_ore)/100.0, count(*), max(total_ore)/100.0 into _g, _n, _max from tx;
  if coalesce(_n,0) = 0 then return null; end if;

  with tx as (
    select * from pos_transactions t
    where t.store_id = _store_id and t.status = 'completed' and coalesce(t.test_mode,false) = false
      and (t.occurred_at at time zone 'Europe/Stockholm')::date = _day
  ), v as (
    select round(case when (e->>'rate')::numeric < 1 then (e->>'rate')::numeric*100 else (e->>'rate')::numeric end, 2) rate,
           sum((e->>'vat')::numeric) vat
    from tx cross join lateral jsonb_array_elements(coalesce(tx.vat_breakdown,'[]'::jsonb)) e group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'amount', round(vat,2), 'vat', round(vat,2)) order by rate), '[]'::jsonb),
         coalesce(sum(vat),0)
    into _vat, _vat_sum from v;

  with tx as (
    select * from pos_transactions t
    where t.store_id = _store_id and t.status = 'completed' and coalesce(t.test_mode,false) = false
      and (t.occurred_at at time zone 'Europe/Stockholm')::date = _day
  ), p as (
    select coalesce(e->>'method', tx.payment_method) method,
           coalesce((e->>'amount_minor')::numeric, tx.total_ore)/100.0 amount
    from tx left join lateral jsonb_array_elements(case when jsonb_typeof(tx.payment_details)='array' then tx.payment_details else '[]'::jsonb end) e on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', round(a,2)) order by a desc), '[]'::jsonb) into _pay
  from (select method, sum(amount) a from p group by 1) x;

  update daily_reports set
    pos_gross_sales = round(_g,2),
    pos_net_sales = round(_g - _vat_sum, 2),
    pos_receipt_count = _n,
    pos_largest_sale = round(_max,2),
    pos_payments = _pay,
    pos_vat_breakdown = _vat,
    pos_source = _src,
    pos_snapshot_at = now()
  where id = _rep.id;
  return _src;
end $$;
revoke execute on function public.daily_report_fill_pos(uuid, date) from public, anon, authenticated;

create or replace function public.trg_fill_pos_from_recon() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'nimpos_reconciliations' then
    if new.store_id is not null and new.status in ('ok','efterhamtad') then
      perform daily_report_fill_pos(new.store_id, new.business_date);
    end if;
  else
    if new.status = 'ok' then
      perform daily_report_fill_pos(m.store_id, new.recon_date) from sumup_merchants m where m.merchant_code = new.merchant_code;
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_fill_pos_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform daily_report_fill_pos(new.store_id, new.report_date);
  return new;
end $$;

drop trigger if exists fill_pos_after_nimpos on public.nimpos_reconciliations;
create trigger fill_pos_after_nimpos after insert or update of status on public.nimpos_reconciliations
  for each row execute function public.trg_fill_pos_from_recon();
drop trigger if exists fill_pos_after_sumup on public.sumup_reconciliations;
create trigger fill_pos_after_sumup after insert or update of status on public.sumup_reconciliations
  for each row execute function public.trg_fill_pos_from_recon();
drop trigger if exists fill_pos_on_insert on public.daily_reports;
create trigger fill_pos_on_insert after insert on public.daily_reports
  for each row execute function public.trg_fill_pos_on_report();

-- 4. Öppna dagar utan dagsrapport enligt öppettiderna (0 = söndag).
create or replace function public.dagsrapporter_saknas(_from date, _to date)
returns table(store_id uuid, store_name text, day date)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, d::date
  from stores s
  cross join generate_series(_from, _to, interval '1 day') d
  join store_opening_hours h on h.store_id = s.id and h.weekday = extract(dow from d)::int and coalesce(h.closed,false) = false
  where s.active and not s.is_wholesale
    and s.name not ilike 'Administration%' and s.name not ilike 'Testbutik%'
    and not exists (select 1 from store_closed_days c where c.store_id = s.id and c.date = d::date)
    and not exists (select 1 from daily_reports r where r.store_id = s.id and r.report_date = d::date)
  order by s.name, d
$$;
revoke execute on function public.dagsrapporter_saknas(date, date) from public, anon;
grant execute on function public.dagsrapporter_saknas(date, date) to authenticated;

create or replace function public.dagsrapport_paminnelse_butikschef()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _today date := (now() at time zone 'Europe/Stockholm')::date;
  _n int := 0;
begin
  if extract(hour from now() at time zone 'Europe/Stockholm') <> 20 then return 0; end if;
  with miss as (
    select store_id, store_name, array_agg(day order by day) days
    from dagsrapporter_saknas(_today - 6, _today) group by 1,2
  ), mottagare as (
    select m.*, st.user_id
    from miss m join stores s on s.id = m.store_id
    left join lateral (
      select x.user_id from staff x
      where x.user_id is not null and nullif(trim(s.manager),'') is not null
        and trim(x.first_name||' '||x.last_name) = trim(s.manager)
      limit 1) st on true
  )
  insert into notifications (portal, target_page, store_id, user_id, message, entity_type, entity_id, dedupe_key)
  select 'shop', '/reports', store_id, user_id,
         'Dagsrapport saknas — ' || store_name || ': ' ||
           (select string_agg(to_char(d,'FMDD/FMMM'), ', ') from unnest(days) d),
         'dagsrapport_saknas', store_id::text,
         'dagsrapport-saknas-' || store_id::text || '-' || _today::text
  from mottagare
  where not exists (select 1 from notifications n where n.dedupe_key = 'dagsrapport-saknas-' || mottagare.store_id::text || '-' || _today::text);
  get diagnostics _n = row_count;
  return _n;
end $$;
revoke execute on function public.dagsrapport_paminnelse_butikschef() from public, anon, authenticated;