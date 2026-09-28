create or replace function public.daily_report_fill_pos(_store_id uuid, _day date)
returns text language plpgsql security definer set search_path = public as $$
declare
  _rep daily_reports;
  _src text;
  _rate numeric;
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
    _src := 'SumUp (ej avstämd)';
  else
    return null;
  end if;

  -- Momssats för kvitton utan momsuppdelning: rapportens sats, annars 2,6 % (CHF) / 6 % (SEK).
  _rate := coalesce(_rep.vat_rate, case when _rep.currency = 'CHF' then 2.6 else 6 end);
  if _rate < 1 then _rate := _rate * 100; end if;

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
           (e->>'vat')::numeric vat
    from tx cross join lateral jsonb_array_elements(coalesce(tx.vat_breakdown,'[]'::jsonb)) e
    union all
    select round(_rate,2), tx.total_ore/100.0 * _rate / (100 + _rate)
    from tx where tx.vat_breakdown is null or jsonb_array_length(tx.vat_breakdown) = 0
  ), g as (select rate, sum(vat) vat from v group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'amount', round(vat,2), 'vat', round(vat,2)) order by rate), '[]'::jsonb),
         coalesce(sum(vat),0)
    into _vat, _vat_sum from g;

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