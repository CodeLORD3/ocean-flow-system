CREATE OR REPLACE FUNCTION public.time_entries_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  expected_entity text;
  target_employee uuid;
  target_store uuid;
BEGIN
  IF NEW.store_id IS NOT NULL THEN
    SELECT s.legal_entity_id INTO expected_entity FROM public.stores s WHERE s.id = NEW.store_id;
    IF expected_entity IS NOT NULL AND NEW.legal_entity_id IS NOT NULL AND expected_entity IS DISTINCT FROM NEW.legal_entity_id THEN
      RAISE EXCEPTION 'Butiken och bolaget måste höra ihop på journalposten';
    END IF;
  END IF;
  IF NEW.corrects_entry_id IS NOT NULL THEN
    SELECT te.employee_id, te.store_id INTO target_employee, target_store FROM public.time_entries te WHERE te.id = NEW.corrects_entry_id;
    IF target_employee IS NULL THEN RAISE EXCEPTION 'Journalposten som ska rättas finns inte'; END IF;
    IF target_employee IS DISTINCT FROM NEW.employee_id OR target_store IS DISTINCT FROM NEW.store_id THEN
      RAISE EXCEPTION 'En rättelse måste gälla samma person och butik';
    END IF;
    IF EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = NEW.corrects_entry_id) THEN
      RAISE EXCEPTION 'Journalposten har redan en rättelse';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS time_entries_validate_insert_trg ON public.time_entries;
CREATE TRIGGER time_entries_validate_insert_trg BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_validate_insert();

CREATE OR REPLACE FUNCTION public.auto_close_open_time_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  e record;
  close_at timestamptz;
  break_end timestamptz;
  inserted_count integer := 0;
BEGIN
  FOR e IN
    SELECT DISTINCT ON (te.employee_id) te.employee_id, te.station_id, te.store_id, te.legal_entity_id,
      te.work_site_id, te.cost_center, te.type, te.occurred_at
    FROM public.time_entries te
    WHERE te.correction_kind IS DISTINCT FROM 'void'
      AND NOT EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = te.id)
    ORDER BY te.employee_id, te.occurred_at DESC, te.id DESC
  LOOP
    IF e.type NOT IN ('in', 'rast_slut', 'rast_start') OR e.occurred_at > now() - interval '12 hours' THEN CONTINUE; END IF;
    close_at := LEAST(now(), e.occurred_at + interval '12 hours');
    IF e.type = 'rast_start' THEN
      break_end := LEAST(close_at, e.occurred_at + interval '30 minutes');
      INSERT INTO public.time_entries (employee_id, station_id, store_id, legal_entity_id, work_site_id, cost_center, type, occurred_at, rounded_at, source, note)
      VALUES (e.employee_id, e.station_id, e.store_id, e.legal_entity_id, e.work_site_id, e.cost_center, 'rast_slut', break_end, break_end, 'clock', 'Automatiskt avslutad rast efter glömd utstämpling');
      inserted_count := inserted_count + 1;
    END IF;
    INSERT INTO public.time_entries (employee_id, station_id, store_id, legal_entity_id, work_site_id, cost_center, type, occurred_at, rounded_at, source, note)
    VALUES (e.employee_id, e.station_id, e.store_id, e.legal_entity_id, e.work_site_id, e.cost_center, 'ut', close_at, close_at, 'clock', 'Automatiskt avslutad efter 12 timmar — kontrollera i attestkön');
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.auto_close_open_time_entries() TO service_role;

CREATE OR REPLACE FUNCTION public.run_time_compliance_checks(
  _from date DEFAULT (now() AT TIME ZONE 'Europe/Stockholm')::date - 1,
  _to date DEFAULT (now() AT TIME ZONE 'Europe/Stockholm')::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  row_data record;
  rest_gap interval;
  week_data record;
  created_count integer := 0;
  source_key text;
BEGIN
  FOR row_data IN
    WITH effective AS (
      SELECT te.* FROM public.time_entries te
      WHERE te.occurred_at >= ((_from - 8)::timestamp AT TIME ZONE 'Europe/Stockholm')
        AND te.occurred_at < ((_to + 9)::timestamp AT TIME ZONE 'Europe/Stockholm')
        AND te.correction_kind IS DISTINCT FROM 'void'
        AND NOT EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = te.id)
    ), ordered AS (
      SELECT e.*, lead(e.type) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) next_type,
        lead(e.occurred_at) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) next_at,
        lag(e.occurred_at) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) previous_at,
        lag(e.type) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) previous_type
      FROM effective e
    )
    SELECT employee_id, store_id, legal_entity_id, occurred_at started_at, next_at ended_at,
      (occurred_at - previous_at) AS previous_gap, previous_type
    FROM ordered WHERE type = 'in' AND next_type = 'ut' AND next_at > occurred_at
  LOOP
    IF row_data.previous_gap IS NOT NULL AND row_data.previous_type = 'ut' THEN
      rest_gap := row_data.previous_gap;
      IF rest_gap < interval '11 hours' AND row_data.started_at::date BETWEEN _from AND _to THEN
        source_key := format('dygnsvila:%s:%s', row_data.employee_id, row_data.started_at);
        IF NOT EXISTS (SELECT 1 FROM public.deviations d WHERE d.source = 'time_clock_rest' AND d.source_id = source_key) THEN
          INSERT INTO public.deviations (source, source_id, title, description, immediate_action, store_id, created_at, updated_at)
          VALUES ('time_clock_rest', source_key, 'Dygnsvila under 11 timmar',
            format('Faktisk vila mellan arbetspass var %s. Kontrollera arbetstidsförläggningen och dokumentera eventuell laglig avvikelse.', rest_gap),
            'Granska passet i attestkön', row_data.store_id, now(), now());
          created_count := created_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  FOR week_data IN
    WITH effective AS (
      SELECT te.* FROM public.time_entries te
      WHERE te.occurred_at >= ((_from - 8)::timestamp AT TIME ZONE 'Europe/Stockholm')
        AND te.occurred_at < ((_to + 9)::timestamp AT TIME ZONE 'Europe/Stockholm')
        AND te.correction_kind IS DISTINCT FROM 'void'
        AND NOT EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = te.id)
    ), ordered AS (
      SELECT e.*, lead(e.type) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) next_type,
        lead(e.occurred_at) OVER (PARTITION BY e.employee_id ORDER BY e.occurred_at, e.id) next_at
      FROM effective e
    ), intervals AS (
      SELECT employee_id, store_id, occurred_at started_at, next_at ended_at
      FROM ordered WHERE type = 'in' AND next_type = 'ut' AND next_at > occurred_at
    ), gaps AS (
      SELECT i.*, i.started_at - lag(i.ended_at) OVER (PARTITION BY i.employee_id ORDER BY i.started_at) gap
      FROM intervals i
    )
    SELECT employee_id, max(store_id) store_id,
      date_trunc('week', started_at AT TIME ZONE 'Europe/Stockholm')::date week_start, max(gap) max_gap
    FROM gaps
    GROUP BY employee_id, date_trunc('week', started_at AT TIME ZONE 'Europe/Stockholm')::date
    HAVING max(gap) IS NOT NULL AND max(gap) < interval '36 hours'
  LOOP
    source_key := format('veckovila:%s:%s', week_data.employee_id, week_data.week_start);
    IF NOT EXISTS (SELECT 1 FROM public.deviations d WHERE d.source = 'time_clock_rest' AND d.source_id = source_key) THEN
      INSERT INTO public.deviations (source, source_id, title, description, immediate_action, store_id, created_at, updated_at)
      VALUES ('time_clock_rest', source_key, 'Veckovila under 36 timmar',
        format('Kontrollsignalen visar att längsta uppmätta vila i veckan %s var %s. Granska hela sjudagarsperioden manuellt.', week_data.week_start, week_data.max_gap),
        'Granska arbetstid och schema', week_data.store_id, now(), now());
      created_count := created_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('created', created_count, 'from', _from, 'to', _to);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.run_time_compliance_checks(date, date) TO service_role;

DO $outer$
DECLARE job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job_id IN SELECT jobid FROM cron.job WHERE jobname IN ('clock-auto-close', 'clock-rest-compliance', 'clock-attest-daily') LOOP
      PERFORM cron.unschedule(job_id);
    END LOOP;
    PERFORM cron.schedule('clock-auto-close', '10 * * * *', 'SELECT public.auto_close_open_time_entries();');
    PERFORM cron.schedule('clock-rest-compliance', '25 4 * * *', 'SELECT public.run_time_compliance_checks();');
    PERFORM cron.schedule('clock-attest-daily', '40 4 * * *', 'SELECT net.http_post(url := ''https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/attest-compute'', headers := ''{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MjYyNzk5NywiZXhwIjoyMDg4MjAzOTk5fQ"}''::jsonb, body := ''{"cron":true}''::jsonb);');
  END IF;
END
$outer$;