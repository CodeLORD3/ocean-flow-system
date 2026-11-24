ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dold_i_partnerfeed boolean NOT NULL DEFAULT false;

CREATE TABLE public.feed_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namn text NOT NULL,
  api_nyckel_hash text UNIQUE,
  aktiv boolean NOT NULL DEFAULT true,
  butiksurval uuid[] NOT NULL DEFAULT '{}',
  skapad timestamptz NOT NULL DEFAULT now(),
  senast_hamtad timestamptz,
  nyckel_skapad timestamptz,
  cache_json jsonb,
  cache_byggd timestamptz
);
GRANT SELECT ON public.feed_partners TO authenticated;
GRANT ALL ON public.feed_partners TO service_role;
ALTER TABLE public.feed_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser partners" ON public.feed_partners FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));
REVOKE SELECT (api_nyckel_hash, cache_json) ON public.feed_partners FROM authenticated;

CREATE TABLE public.feed_hamtningar (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid REFERENCES public.feed_partners(id) ON DELETE CASCADE,
  tidpunkt timestamptz NOT NULL DEFAULT now(),
  ip text,
  http_status integer NOT NULL
);
CREATE INDEX feed_hamtningar_partner_tid ON public.feed_hamtningar(partner_id, tidpunkt DESC);
GRANT SELECT ON public.feed_hamtningar TO authenticated;
GRANT ALL ON public.feed_hamtningar TO service_role;
ALTER TABLE public.feed_hamtningar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser hämtlogg" ON public.feed_hamtningar FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public._feed_admin_check() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Endast admin';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._feed_new_key(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE k text := 'sfb_' || encode(extensions.gen_random_bytes(32),'hex');
BEGIN
  UPDATE public.feed_partners SET api_nyckel_hash = encode(extensions.digest(k,'sha256'),'hex'),
    nyckel_skapad = now(), cache_json = NULL, cache_byggd = NULL WHERE id = _id;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION public._feed_new_key(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.feed_partner_create(_namn text, _butiksurval uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
  PERFORM public._feed_admin_check();
  IF coalesce(trim(_namn),'') = '' THEN RAISE EXCEPTION 'Namn krävs'; END IF;
  INSERT INTO public.feed_partners(namn, butiksurval) VALUES (trim(_namn), coalesce(_butiksurval,'{}')) RETURNING id INTO pid;
  RETURN jsonb_build_object('id', pid, 'nyckel', public._feed_new_key(pid));
END $$;

CREATE OR REPLACE FUNCTION public.feed_partner_rotate_key(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public._feed_admin_check();
  IF NOT EXISTS (SELECT 1 FROM public.feed_partners WHERE id=_id) THEN RAISE EXCEPTION 'Okänd partner'; END IF;
  RETURN public._feed_new_key(_id);
END $$;

CREATE OR REPLACE FUNCTION public.feed_partner_update(_id uuid, _aktiv boolean, _butiksurval uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public._feed_admin_check();
  UPDATE public.feed_partners SET aktiv = coalesce(_aktiv, aktiv),
    butiksurval = coalesce(_butiksurval, butiksurval), cache_json = NULL, cache_byggd = NULL WHERE id=_id;
END $$;

REVOKE ALL ON FUNCTION public.feed_partner_create(text,uuid[]), public.feed_partner_rotate_key(uuid), public.feed_partner_update(uuid,boolean,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_partner_create(text,uuid[]), public.feed_partner_rotate_key(uuid), public.feed_partner_update(uuid,boolean,uuid[]) TO authenticated;

INSERT INTO public.feed_partners(namn, butiksurval)
SELECT 'Skaldjursbörsen', array_agg(id ORDER BY name) FROM public.stores
WHERE store_code IN ('torslanda-torg','amhult','saro','eriksberg','alsten','kungsholmen');

SELECT cron.schedule('feed-hamtningar-rensa', '15 3 * * *', $$DELETE FROM public.feed_hamtningar WHERE tidpunkt < now() - interval '90 days'$$);