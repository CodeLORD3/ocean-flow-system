CREATE OR REPLACE FUNCTION public.pos_live_summary(_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per_store as (
    select s.id, s.name, coalesce(s.currency, 'SEK') as currency,
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
    'stores', coalesce((select jsonb_agg(jsonb_build_object('store_id', id, 'name', name, 'currency', currency, 'summary', sum) order by name) from per_store), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'amount', amount, 'receipts', receipts) order by h) from hours), '[]'::jsonb),
    'ops', jsonb_build_object(
      'failed', (select count(*) from public.nimpos_webhook_events where status = 'failed'),
      'unmapped', (select count(*) from public.nimpos_webhook_events where status = 'unmapped_store'),
      'pending', (select count(*) from public.nimpos_webhook_events where status = 'pending'),
      'unmatched_products', (select count(*) from public.nimpos_product_map where product_id is null)
    )
  )
$function$;