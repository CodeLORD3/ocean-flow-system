insert into public.user_roles (user_id, role)
values ('502d8f71-df1f-48b1-91cf-2f6034e36f52', 'platform_admin')
on conflict (user_id, role) do nothing;

insert into public.user_scopes (user_id, scope_type, scope_value)
values ('502d8f71-df1f-48b1-91cf-2f6034e36f52','portal','admin')
on conflict do nothing;