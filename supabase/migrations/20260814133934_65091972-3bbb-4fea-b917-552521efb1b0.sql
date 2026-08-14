INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT '7ad1da12-f770-41ad-a55d-092f18d004c1', 'store', s.id::text FROM public.stores s
ON CONFLICT (user_id, scope_type, scope_value) DO NOTHING;

INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
VALUES ('7ad1da12-f770-41ad-a55d-092f18d004c1','portal','shop'),
       ('7ad1da12-f770-41ad-a55d-092f18d004c1','portal','wholesale'),
       ('7ad1da12-f770-41ad-a55d-092f18d004c1','portal','production')
ON CONFLICT (user_id, scope_type, scope_value) DO NOTHING;