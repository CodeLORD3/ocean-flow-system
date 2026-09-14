CREATE TABLE public.attestation_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id uuid NOT NULL REFERENCES public.attestations(id) ON DELETE CASCADE,
  action text NOT NULL,
  basis text,
  minutes_before integer,
  minutes_after integer,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attestation_journal_attestation_idx ON public.attestation_journal(attestation_id, created_at DESC);

GRANT SELECT, INSERT ON public.attestation_journal TO authenticated;
GRANT ALL ON public.attestation_journal TO service_role;

ALTER TABLE public.attestation_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan läsa attestjournalen"
ON public.attestation_journal FOR SELECT TO authenticated
USING (public.is_staff());

CREATE POLICY "Personal kan skriva attestjournal"
ON public.attestation_journal FOR INSERT TO authenticated
WITH CHECK (public.is_staff());

CREATE OR REPLACE FUNCTION public.attest_weekly_reminder()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _week text := to_char((now() AT TIME ZONE 'Europe/Stockholm')::date, 'IYYY-"W"IW');
  _created integer := 0;
BEGIN
  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, dedupe_key)
  SELECT 'shop', '/attestations', a.store_id,
         'Oattesterade pass äldre än 7 dagar: ' || count(*) || ' rader väntar på attest',
         'attestation',
         'attest_reminder|' || a.store_id || '|' || _week
  FROM public.attestations a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE a.status = 'flagged'
    AND e.is_test = false
    AND a.date < ((now() AT TIME ZONE 'Europe/Stockholm')::date - 7)
    AND a.store_id IS NOT NULL
  GROUP BY a.store_id
  ON CONFLICT (dedupe_key) DO NOTHING;

  GET DIAGNOSTICS _created = ROW_COUNT;
  RETURN _created;
END;
$$;

SELECT cron.schedule(
  'attest-weekly-reminder',
  '0 6 * * 1',
  $$SELECT public.attest_weekly_reminder();$$
);