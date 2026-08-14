-- Backfyllnad: befintliga konton utan behörighetsrader får butiksportalen
-- (och sin butik om personalkortet har en).
INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'portal', 'shop'
FROM public.staff s
WHERE s.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_scopes u
    WHERE u.user_id = s.user_id AND u.scope_type IN ('portal','store')
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'store', s.store_id::text
FROM public.staff s
WHERE s.user_id IS NOT NULL AND s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_scopes u
    WHERE u.user_id = s.user_id AND u.scope_type = 'store'
  )
ON CONFLICT DO NOTHING;