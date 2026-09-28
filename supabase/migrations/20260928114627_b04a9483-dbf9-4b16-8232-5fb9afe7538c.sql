create table public.user_start_page (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vd_overview boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_start_page to authenticated;
grant all on public.user_start_page to service_role;
alter table public.user_start_page enable row level security;
create policy "Egen startsida" on public.user_start_page for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
insert into public.user_start_page(user_id, vd_overview)
  select distinct user_id, true from public.user_roles where role = 'platform_admin'
  on conflict (user_id) do update set vd_overview = true;