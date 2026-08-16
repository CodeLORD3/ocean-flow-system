delete from public.stock_movements
where reference_type in ('pos', 'pos_sale', 'sumup')
  and reference_id in (select id from public.pos_transactions where source = 'sumup');

delete from public.pos_transaction_items
where transaction_id in (select id from public.pos_transactions where source = 'sumup');

delete from public.pos_transactions where source = 'sumup';

update public.sumup_events
set status = 'koad', transaction_id = null, processed_at = null, last_error = null;