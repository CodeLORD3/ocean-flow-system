CREATE TABLE public.telefonsamtal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skapad timestamptz NOT NULL DEFAULT now(),
  namn text NOT NULL,
  foretag text,
  telefon text,
  arende text NOT NULL,
  kategori text NOT NULL DEFAULT 'ovrigt' CHECK (kategori IN ('kund','personal','leverantor','saljare','myndighet','bank_revisor_jurist','privat','ovrigt')),
  atgard text NOT NULL CHECK (atgard IN ('koppla','meddelande','hanvisad','avbojd')),
  bradskande boolean NOT NULL DEFAULT false,
  basta_tid text,
  status text NOT NULL DEFAULT 'ny' CHECK (status IN ('ny','läst','klar')),
  vd_anteckning text,
  sms_status text CHECK (sms_status IN ('skickad','testlage','fel','ej_aktuellt')),
  uppdaterad timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telefonsamtal_skapad_idx ON public.telefonsamtal (skapad DESC);
CREATE INDEX telefonsamtal_atgard_status_idx ON public.telefonsamtal (atgard, status);
GRANT SELECT, UPDATE ON public.telefonsamtal TO authenticated;
GRANT ALL ON public.telefonsamtal TO service_role;
ALTER TABLE public.telefonsamtal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telefonsamtal admin select" ON public.telefonsamtal FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "telefonsamtal admin update" ON public.telefonsamtal FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.telefon_touch_uppdaterad() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.uppdaterad := now(); RETURN NEW; END; $$;
CREATE TRIGGER telefonsamtal_touch BEFORE UPDATE ON public.telefonsamtal FOR EACH ROW EXECUTE FUNCTION public.telefon_touch_uppdaterad();

CREATE TABLE public.telefon_nycklar (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nyckel_hash text NOT NULL,
  skapad timestamptz NOT NULL DEFAULT now(),
  senast_anvand timestamptz,
  aktiv boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX telefon_nycklar_en_aktiv ON public.telefon_nycklar ((true)) WHERE aktiv;
GRANT ALL ON public.telefon_nycklar TO service_role;
ALTER TABLE public.telefon_nycklar ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telefon_installningar (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  vd_sms_nummer text,
  sms_vid_koppling boolean NOT NULL DEFAULT true,
  uppdaterad timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.telefon_installningar (id) VALUES (true);
GRANT SELECT, UPDATE ON public.telefon_installningar TO authenticated;
GRANT ALL ON public.telefon_installningar TO service_role;
ALTER TABLE public.telefon_installningar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telefon_installningar admin select" ON public.telefon_installningar FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "telefon_installningar admin update" ON public.telefon_installningar FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER telefon_installningar_touch BEFORE UPDATE ON public.telefon_installningar FOR EACH ROW EXECUTE FUNCTION public.telefon_touch_uppdaterad();

CREATE TABLE public.telefon_logg (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tid timestamptz NOT NULL DEFAULT now(),
  utfall text NOT NULL CHECK (utfall IN ('sparad','dubblett','avvisad')),
  orsak text
);
CREATE INDEX telefon_logg_tid_idx ON public.telefon_logg (tid DESC);
GRANT ALL ON public.telefon_logg TO service_role;
ALTER TABLE public.telefon_logg ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_log DROP CONSTRAINT sms_log_type_check;
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_type_check CHECK (type IN ('otp','bekraftelse','paminnelse','paminnelse_tidig','telefonist'));

CREATE OR REPLACE FUNCTION public.skapa_telefonnyckel() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Endast administratörer';
  END IF;
  k := encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE public.telefon_nycklar SET aktiv = false WHERE aktiv;
  INSERT INTO public.telefon_nycklar (nyckel_hash) VALUES (encode(extensions.digest(k, 'sha256'), 'hex'));
  RETURN k;
END; $$;
REVOKE ALL ON FUNCTION public.skapa_telefonnyckel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skapa_telefonnyckel() TO authenticated;

CREATE OR REPLACE FUNCTION public.telefon_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Endast administratörer';
  END IF;
  RETURN jsonb_build_object(
    'aktiv_nyckel', EXISTS (SELECT 1 FROM telefon_nycklar WHERE aktiv),
    'nyckel_skapad', (SELECT skapad FROM telefon_nycklar WHERE aktiv),
    'senast_anvand', (SELECT senast_anvand FROM telefon_nycklar WHERE aktiv),
    'senaste_samtal', (SELECT max(skapad) FROM telefonsamtal),
    'idag', (SELECT count(*) FROM telefonsamtal WHERE skapad >= date_trunc('day', now() AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'Europe/Stockholm'),
    'avvisade_dygn', (SELECT count(*) FROM telefon_logg WHERE utfall = 'avvisad' AND tid > now() - interval '24 hours'),
    'senaste_sms_status', (SELECT status FROM sms_log WHERE type = 'telefonist' ORDER BY created_at DESC LIMIT 1),
    'senaste_sms_tid', (SELECT created_at FROM sms_log WHERE type = 'telefonist' ORDER BY created_at DESC LIMIT 1)
  );
END; $$;
REVOKE ALL ON FUNCTION public.telefon_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telefon_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.gallra_telefonsamtal() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a integer; b integer;
BEGIN
  DELETE FROM public.telefonsamtal WHERE skapad < now() - interval '90 days';
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.telefon_logg WHERE tid < now() - interval '90 days';
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN a + b;
END; $$;
REVOKE ALL ON FUNCTION public.gallra_telefonsamtal() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('gdpr-gallring-telefonsamtal', '40 3 * * *', 'SELECT public.gallra_telefonsamtal();');