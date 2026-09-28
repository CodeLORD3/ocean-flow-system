create table public.fortnox_vouchers (
  id uuid primary key default gen_random_uuid(),
  legal_entity_code text not null,
  financial_year int not null,
  voucher_series text not null,
  voucher_number int not null,
  transaction_date date,
  description text,
  cost_center text,
  rows jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (legal_entity_code, financial_year, voucher_series, voucher_number)
);
grant select on public.fortnox_vouchers to authenticated;
grant all on public.fortnox_vouchers to service_role;
alter table public.fortnox_vouchers enable row level security;
create policy "Admins read vouchers" on public.fortnox_vouchers for select to authenticated using (public.has_role(auth.uid(),'admin'));
create index on public.fortnox_vouchers (legal_entity_code, transaction_date);

create table public.fortnox_account_balances (
  id uuid primary key default gen_random_uuid(),
  legal_entity_code text not null,
  financial_year int not null,
  account text not null,
  cost_center text not null default '',
  period date not null,
  balance numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (legal_entity_code, financial_year, account, cost_center, period)
);
grant select on public.fortnox_account_balances to authenticated;
grant all on public.fortnox_account_balances to service_role;
alter table public.fortnox_account_balances enable row level security;
create policy "Admins read balances" on public.fortnox_account_balances for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.fortnox_ledger_sync_state (
  legal_entity_code text primary key,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_voucher_date date,
  vouchers_fetched int not null default 0,
  balance_rows int not null default 0,
  last_error text,
  details jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.fortnox_ledger_sync_state to authenticated;
grant all on public.fortnox_ledger_sync_state to service_role;
alter table public.fortnox_ledger_sync_state enable row level security;
create policy "Admins read ledger sync state" on public.fortnox_ledger_sync_state for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- Periodsaldon från verifikationsrader (debet − kredit per konto, kostnadsställe och månad).
create or replace function public.fortnox_rebuild_balances(p_entity text, p_year int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from fortnox_account_balances where legal_entity_code = p_entity and financial_year = p_year;
  insert into fortnox_account_balances (legal_entity_code, financial_year, account, cost_center, period, balance)
  select v.legal_entity_code, v.financial_year, r->>'Account',
         coalesce(nullif(r->>'CostCenter',''), ''),
         date_trunc('month', v.transaction_date)::date,
         round(sum(coalesce((r->>'Debit')::numeric,0) - coalesce((r->>'Credit')::numeric,0)), 2)
  from fortnox_vouchers v cross join lateral jsonb_array_elements(v.rows) r
  where v.legal_entity_code = p_entity and v.financial_year = p_year
    and v.transaction_date is not null and coalesce((r->>'Removed')::boolean,false) = false
    and r->>'Account' is not null
  group by 1,2,3,4,5;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fortnox_rebuild_balances(text,int) from public, anon, authenticated;
grant execute on function public.fortnox_rebuild_balances(text,int) to service_role;