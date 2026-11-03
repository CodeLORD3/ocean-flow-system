CREATE TABLE public.mail_intake_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  from_email text,
  from_name text,
  subject text,
  sent_at timestamptz,
  size_bytes integer,
  supplier_id uuid,
  legal_entity_id text,
  status text NOT NULL DEFAULT 'forsok_igen' CHECK (status IN ('forsok_igen','behover_atgard','lyckad','hanterad')),
  reason text NOT NULL DEFAULT 'avbruten',
  detail text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_document_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.mail_intake_failures TO authenticated;
GRANT ALL ON public.mail_intake_failures TO service_role;
ALTER TABLE public.mail_intake_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read mail failures" ON public.mail_intake_failures FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Staff resolve mail failures" ON public.mail_intake_failures FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff() AND status IN ('hanterad','behover_atgard'));
CREATE INDEX mail_intake_failures_open_idx ON public.mail_intake_failures (status, last_attempt_at DESC);

-- Varning till kontoret: öppna mejl som behöver åtgärd, eller hämtningen står still dagtid.
CREATE OR REPLACE FUNCTION public.mail_intake_watch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now timestamptz := now();
  _local timestamp := _now AT TIME ZONE 'Europe/Stockholm';
  _day text := to_char(_local, 'YYYY-MM-DD');
  _open int;
  _last_ok timestamptz;
  _sent int := 0;
BEGIN
  SELECT count(*) INTO _open FROM mail_intake_failures WHERE status = 'behover_atgard';
  IF _open > 0 AND extract(hour FROM _local) >= 8 THEN
    INSERT INTO notifications (portal, target_page, message, entity_type, dedupe_key)
    VALUES ('wholesale', '/purchase-reporting',
      _open || ' mejl i inköpskorgen kunde inte läsas in och behöver hanteras för hand (fliken Behöver åtgärd).',
      'mail_intake', 'mail_intake_atgard:' || _day)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS _sent = ROW_COUNT;
  END IF;
  IF extract(hour FROM _local) BETWEEN 7 AND 19 THEN
    SELECT max(started_at) INTO _last_ok FROM mail_intake_runs
      WHERE ok = true AND coalesce(folder,'') NOT LIKE 'fortnox:%';
    IF _last_ok IS NULL OR _last_ok < _now - interval '1 hour' THEN
      INSERT INTO notifications (portal, target_page, message, entity_type, dedupe_key)
      VALUES ('wholesale', '/purchase-reporting',
        'Inköpskorgen har inte hämtat mejl på över en timme. Kontrollera mailkorgen.',
        'mail_intake', 'mail_intake_stilla:' || _day)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN jsonb_build_object('open', _open, 'last_ok', _last_ok, 'sent', _sent);
END $$;
REVOKE ALL ON FUNCTION public.mail_intake_watch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_intake_watch() TO service_role;