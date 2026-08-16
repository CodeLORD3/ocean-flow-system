with tx as (
  select distinct t.id, t.external_id
  from public.pos_transactions t
  join public.pos_transaction_items i on i.transaction_id = t.id
  where t.source = 'sumup'
    and lower(i.product_name) in ('skagen classic small','signal','sauce')
),
del_mov as (
  delete from public.stock_movements where reference_id in (select id from tx)
),
del_items as (
  delete from public.pos_transaction_items where transaction_id in (select id from tx)
),
del_tx as (
  delete from public.pos_transactions where id in (select id from tx)
)
update public.sumup_events e
set status = 'koad', transaction_id = null, processed_at = null, last_error = null
where e.external_id in (select external_id from tx);