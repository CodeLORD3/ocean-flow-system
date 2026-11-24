REVOKE SELECT ON public.feed_partners FROM authenticated;
GRANT SELECT (id, namn, aktiv, butiksurval, skapad, senast_hamtad, nyckel_skapad) ON public.feed_partners TO authenticated;