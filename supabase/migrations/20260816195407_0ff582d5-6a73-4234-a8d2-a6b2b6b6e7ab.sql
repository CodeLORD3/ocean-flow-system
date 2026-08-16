alter table public.pos_transaction_items
  drop constraint if exists pos_transaction_items_product_id_fkey;

alter table public.pos_transaction_items
  add constraint pos_transaction_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

update public.sumup_events
set status = 'koad', transaction_id = null, processed_at = null, last_error = null
where status = 'fel';