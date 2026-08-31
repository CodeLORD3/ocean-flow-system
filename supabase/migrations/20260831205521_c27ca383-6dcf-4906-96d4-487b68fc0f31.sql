alter table public.absence_requests
  add column if not exists date_from date,
  add column if not exists date_to date,
  add column if not exists basis text not null default 'enligt_schema',
  add column if not exists reason text;

update public.absence_requests
set date_from = coalesce(date_from, start_date),
    date_to = coalesce(date_to, end_date),
    reason = coalesce(reason, note)
where date_from is null or date_to is null or reason is null;

create or replace function public.sync_absence_request_period_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.date_from is not null then new.start_date := new.date_from; end if;
  if new.date_to is not null then new.end_date := new.date_to; end if;
  if new.reason is not null then new.note := new.reason; end if;
  new.date_from := new.start_date;
  new.date_to := new.end_date;
  new.reason := new.note;
  return new;
end;
$$;

drop trigger if exists absence_requests_sync_period_fields_trg on public.absence_requests;
create trigger absence_requests_sync_period_fields_trg
before insert or update on public.absence_requests
for each row execute function public.sync_absence_request_period_fields();

insert into public.absence_types (code, name, requires_approval, affects_vacation_balance, is_vacation_earning, is_sick, color_token, sort_order, is_active)
values
  ('arbetsskada', 'Arbetsskada', true, false, false, false, 'alert-600', 50, true),
  ('havandeskapspenning', 'Havandeskapspenning', true, false, false, false, 'warn-600', 60, true),
  ('narstaendevard', 'Närståendevård', true, false, false, false, 'accent-600', 70, true),
  ('utbildning', 'Utbildning', true, false, false, false, 'accent-600', 80, true)
on conflict (code) do update set
  name = excluded.name,
  requires_approval = excluded.requires_approval,
  affects_vacation_balance = excluded.affects_vacation_balance,
  is_vacation_earning = excluded.is_vacation_earning,
  is_sick = excluded.is_sick,
  color_token = excluded.color_token,
  sort_order = excluded.sort_order,
  is_active = true;

DO $$
declare
  job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for job_id in select jobid from cron.job where jobname in ('makrilltrade-hr-daily-checks', 'makrilltrade-hr-notify') loop
      perform cron.unschedule(job_id);
    end loop;
    perform cron.schedule('makrilltrade-hr-daily-checks', '15 6 * * *', $job$select public.hr_daily_checks();$job$);
  end if;
exception when undefined_table then
  null;
end $$;