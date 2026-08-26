alter table public.fortnox_connections add column if not exists auto_bookkeep boolean not null default false;

alter table public.fortnox_invoice_jobs drop constraint if exists fortnox_invoice_jobs_status_check;
alter table public.fortnox_invoice_jobs add constraint fortnox_invoice_jobs_status_check
  check (status in ('pending','creating','created','bookkept','sent','paid','cancelled','failed'));

alter table public.fortnox_invoice_jobs
  add column if not exists fortnox_booked boolean,
  add column if not exists fortnox_sent boolean,
  add column if not exists fortnox_cancelled boolean,
  add column if not exists fortnox_balance numeric,
  add column if not exists fortnox_total numeric,
  add column if not exists final_pay_date date,
  add column if not exists status_synced_at timestamptz,
  add column if not exists cancelled_at timestamptz;