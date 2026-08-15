insert into public.user_scopes (user_id, scope_type, scope_value)
select 'abfa63fd-d441-4747-b3ea-a4ec1f1f0f78', 'store', st.id::text
from public.stores st
where coalesce(st.is_wholesale, false) = false
on conflict (user_id, scope_type, scope_value) do nothing;