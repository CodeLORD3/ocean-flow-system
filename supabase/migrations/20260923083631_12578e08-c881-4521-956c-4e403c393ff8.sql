GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.page_visits TO authenticated;
GRANT ALL ON public.page_visits TO service_role;

ALTER TABLE public.entity_images ALTER COLUMN entity_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.run_time_compliance_checks(_from date DEFAULT (((now() AT TIME ZONE 'Europe/Stockholm'::text))::date - 1), _to date DEFAULT ((now() AT TIME ZONE 'Europe/Stockholm'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT employee_id, (array_agg(store_id ORDER BY started_at DESC))[1] store_id,
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
$function$;