alter table public.pos_transactions
  drop constraint if exists pos_transactions_payment_method_check;

alter table public.pos_transactions
  add constraint pos_transactions_payment_method_check
  check (payment_method = any (array['kort','kontant','swish','twint','faktura','ovrigt','delad','parked']));