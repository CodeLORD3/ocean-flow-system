delete from public.pos_transaction_items
where transaction_id in (
  select id from public.pos_transactions
  where source = 'sumup' and external_id = '20cd942c-2ddb-4c13-903d-3799c228a7e0'
);

delete from public.pos_transactions
where source = 'sumup' and external_id = '20cd942c-2ddb-4c13-903d-3799c228a7e0';

update public.sumup_events
set status = 'koad', transaction_id = null, processed_at = null, last_error = null
where external_id = '20cd942c-2ddb-4c13-903d-3799c228a7e0';