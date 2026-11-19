ALTER TABLE public.attestations ADD COLUMN IF NOT EXISTS schedule_baseline jsonb;
COMMENT ON COLUMN public.attestations.schedule_baseline IS 'Schemafönstret när dagen först räknades {sched_from, sched_to, scheduled_minutes}. Mer tid inom ett senare utökat schema blir delen schemaandring och betalas först efter attest.';

CREATE OR REPLACE FUNCTION public.attestation_apply_parts(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.attestations;
  c jsonb;
  parts jsonb;
  d jsonb;
  p jsonb;
  k text;
  dec text;
  win_in timestamptz;
  win_out timestamptz;
  recovered integer := 0;
  withheld integer := 0;
  pending boolean := false;
  clipped integer := 0;
  n_parts integer;
BEGIN
  SELECT * INTO r FROM public.attestations WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status = 'rejected' OR (r.computed->>'model') IS DISTINCT FROM 'delar' THEN
    RETURN;
  END IF;
  c := r.computed;
  parts := COALESCE(c->'parts', '[]'::jsonb);
  d := COALESCE(r.part_decisions, '{}'::jsonb);
  n_parts := jsonb_array_length(parts);

  IF c->>'sched_from' IS NOT NULL THEN
    win_in := (c->>'sched_from')::timestamptz;
    win_out := (c->>'sched_to')::timestamptz;
  ELSE
    win_in := (c->>'eff_in')::timestamptz;
    win_out := win_in;
  END IF;
  recovered := COALESCE((c->>'tol_short_minutes')::integer, 0);

  FOR p IN SELECT value FROM jsonb_array_elements(parts) LOOP
    k := p->>'kind';
    dec := d->k->>'decision';
    -- Tid som schemat utökats med i efterhand betalas bara när den är godkänd.
    IF k = 'schemaandring' AND dec IS DISTINCT FROM 'godkand' THEN
      withheld := withheld + COALESCE((p->>'minutes')::integer, 0);
    END IF;
    IF dec IS NULL THEN
      pending := true;
      CONTINUE;
    END IF;
    IF k = 'tidig_in' AND dec = 'godkand' THEN
      win_in := (c->>'eff_in')::timestamptz;
    ELSIF k = 'sen_ut' AND dec = 'godkand' THEN
      win_out := (c->>'eff_out')::timestamptz;
    ELSIF k = 'oplanerad' AND dec = 'godkand' THEN
      win_in := (c->>'eff_in')::timestamptz;
      win_out := (c->>'eff_out')::timestamptz;
    ELSIF k IN ('sen_in', 'tidig_ut', 'missat_pass') AND dec = 'schema' THEN
      recovered := recovered + COALESCE((p->>'minutes')::integer, 0);
    END IF;
  END LOOP;

  UPDATE public.attestations SET payroll_in = win_in, payroll_out = win_out WHERE id = _id;

  SELECT COALESCE((SELECT b.total_minutes FROM public.berakna_arbetstid_rad(r.employee_id, r.date, r.date, true) b
                    WHERE b.arbetsdag = r.date), 0)
    INTO clipped;

  UPDATE public.attestations
     SET approved_minutes = GREATEST(0, clipped + recovered - withheld),
         status = CASE WHEN pending THEN 'flagged' WHEN n_parts > 0 THEN 'approved' ELSE 'auto_approved' END,
         basis = CASE WHEN pending THEN NULL WHEN n_parts > 0 THEN 'avvikelse' ELSE 'schema' END,
         decided_at = CASE WHEN pending THEN NULL ELSE COALESCE(decided_at, now()) END
   WHERE id = _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decide_attestation_part(_attestation_id uuid, _part text, _decision text, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.attestations;
  p jsonb;
  before_min integer;
  after_row public.attestations;
  label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inloggning krävs';
  END IF;
  SELECT * INTO r FROM public.attestations WHERE id = _attestation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attestraden finns inte';
  END IF;
  IF NOT (public.can_manage_schedule(r.store_id, r.legal_entity_id)
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas för att attestera den här enheten';
  END IF;
  IF (r.computed->>'model') IS DISTINCT FROM 'delar' THEN
    RAISE EXCEPTION 'Dagen saknar avvikelser att attestera per del';
  END IF;
  SELECT value INTO p FROM jsonb_array_elements(COALESCE(r.computed->'parts', '[]'::jsonb)) WHERE value->>'kind' = _part LIMIT 1;
  IF p IS NULL THEN
    RAISE EXCEPTION 'Avvikelsen finns inte på dagen';
  END IF;
  IF _decision IS NOT NULL AND NOT (
       (_part IN ('tidig_in', 'sen_ut', 'oplanerad', 'schemaandring') AND _decision IN ('godkand', 'nekad'))
    OR (_part IN ('sen_in', 'tidig_ut', 'missat_pass') AND _decision IN ('stamplad', 'schema'))
  ) THEN
    RAISE EXCEPTION 'Ogiltigt beslut för avvikelsen';
  END IF;

  before_min := r.approved_minutes;
  UPDATE public.attestations
     SET part_decisions = CASE WHEN _decision IS NULL THEN part_decisions - _part
                               ELSE part_decisions || jsonb_build_object(_part, jsonb_build_object(
                                 'decision', _decision, 'by', auth.uid(), 'at', now(), 'note', NULLIF(trim(COALESCE(_note, '')), '')))
                          END,
         status = 'flagged',
         decided_by = auth.uid(),
         decided_at = NULL
   WHERE id = _attestation_id;

  PERFORM public.attestation_apply_parts(_attestation_id);
  SELECT * INTO after_row FROM public.attestations WHERE id = _attestation_id;

  label := CASE _part
    WHEN 'tidig_in' THEN 'Stämplade in tidigare'
    WHEN 'sen_in' THEN 'Stämplade in senare'
    WHEN 'tidig_ut' THEN 'Stämplade ut tidigare'
    WHEN 'sen_ut' THEN 'Stämplade ut senare'
    WHEN 'oplanerad' THEN 'Ej schemalagd tid'
    WHEN 'schemaandring' THEN 'Schemat ändrat i efterhand'
    ELSE 'Ingen stämpling' END
    || ' (' || COALESCE(p->>'minutes', '0') || ' min): '
    || CASE _decision
         WHEN 'godkand' THEN 'godkänd'
         WHEN 'nekad' THEN 'nekad'
         WHEN 'stamplad' THEN 'stämplad tid'
         WHEN 'schema' THEN 'schematid'
         ELSE 'beslut ångrat' END;

  INSERT INTO public.attestation_journal (attestation_id, action, basis, minutes_before, minutes_after, note, actor_id)
  VALUES (_attestation_id, 'avvikelse', 'avvikelse', before_min, after_row.approved_minutes,
          label || COALESCE(' · ' || NULLIF(trim(COALESCE(_note, '')), ''), ''), auth.uid());

  RETURN jsonb_build_object('status', after_row.status, 'approved_minutes', after_row.approved_minutes, 'part_decisions', after_row.part_decisions);
END;
$function$;

-- Schemaändring på en avslutad dag väcker attest-compute med bara datum; funktionen läser om allt själv.
CREATE OR REPLACE FUNCTION public.shift_attest_recompute_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  dates date[] := ARRAY[]::date[];
  d date;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (
       NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.break_minutes IS DISTINCT FROM OLD.break_minutes OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.date < today AND OLD.date >= today - 62 THEN dates := dates || OLD.date; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') AND NEW.date < today AND NEW.date >= today - 62 AND NOT (NEW.date = ANY(dates)) THEN dates := dates || NEW.date; END IF;
  FOREACH d IN ARRAY dates LOOP
    PERFORM net.http_post(
      url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/attest-compute',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
      body := jsonb_build_object('schedule_change_date', d));
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.shift_attest_recompute_dispatch() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS shifts_attest_recompute ON public.shifts;
CREATE TRIGGER shifts_attest_recompute AFTER INSERT OR UPDATE OR DELETE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shift_attest_recompute_dispatch();