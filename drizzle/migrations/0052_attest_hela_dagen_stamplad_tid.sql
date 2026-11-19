CREATE OR REPLACE FUNCTION public.attestation_whole_day_stamped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  decs jsonb := '{}'::jsonb;
  p jsonb;
  k text;
  before_min integer := NEW.approved_minutes;
  after_min integer;
BEGIN
  FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.computed->'parts', '[]'::jsonb)) LOOP
    k := p->>'kind';
    decs := decs || jsonb_build_object(k, jsonb_build_object(
      'decision', CASE WHEN k IN ('tidig_in', 'sen_ut', 'oplanerad', 'schemaandring') THEN 'godkand' ELSE 'stamplad' END,
      'by', NEW.decided_by, 'at', COALESCE(NEW.decided_at, now()),
      'note', 'Hela dagen godkänd med stämplad tid'));
  END LOOP;

  UPDATE public.attestations SET part_decisions = decs WHERE id = NEW.id;
  PERFORM public.attestation_apply_parts(NEW.id);
  SELECT approved_minutes INTO after_min FROM public.attestations WHERE id = NEW.id;

  INSERT INTO public.attestation_journal (attestation_id, action, basis, minutes_before, minutes_after, note, actor_id)
  VALUES (NEW.id, 'avvikelse', 'avvikelse', before_min, after_min,
          'Hela dagen godkänd med stämplad tid: all stämplad tid räknas för lön, OB och mertid', NEW.decided_by);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS attestations_whole_day_stamped ON public.attestations;
CREATE TRIGGER attestations_whole_day_stamped
AFTER INSERT OR UPDATE OF status, basis ON public.attestations
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.basis = 'stamplad' AND (NEW.computed->>'model') = 'delar')
EXECUTE FUNCTION public.attestation_whole_day_stamped();