-- Etapp 2b seed/körbevis. Kör efter att utkastmigrationerna accepterats.
-- Kör med service_role i en testkörning. Transaktionen rullas tillbaka; inga testposter blir kvar.

BEGIN;

DO $$
DECLARE
  v_employee uuid;
  v_client_id uuid := gen_random_uuid();
  v_duplicate_id uuid;
  v_normal jsonb;
  v_midnight jsonb;
  v_dst jsonb;
  v_duplicate_count integer;
BEGIN
  INSERT INTO public.employees (first_name, last_name, is_active)
  VALUES ('Körbevis', 'Etapp 2b', true)
  RETURNING id INTO v_employee;

  -- Normalpass + samma klient-id två gånger: ska ge exakt en journalrad.
  INSERT INTO public.time_entries (employee_id, type, occurred_at, source, client_punch_id)
  VALUES (v_employee, 'in', '2026-03-10 08:00:00+01', 'manual', v_client_id)
  RETURNING id INTO v_duplicate_id;
  INSERT INTO public.time_entries (employee_id, type, occurred_at, source, client_punch_id)
  VALUES (v_employee, 'in', '2026-03-10 08:00:00+01', 'manual', v_client_id)
  ON CONFLICT (employee_id, client_punch_id) DO NOTHING;
  SELECT count(*) INTO v_duplicate_count
  FROM public.time_entries WHERE employee_id = v_employee AND client_punch_id = v_client_id;
  IF v_duplicate_count <> 1 THEN RAISE EXCEPTION 'client_punch_id-idempotens FEL: % rader', v_duplicate_count; END IF;

  INSERT INTO public.time_entries (employee_id, type, occurred_at, source, client_punch_id)
  VALUES
    (v_employee, 'ut', '2026-03-10 16:00:00+01', 'manual', gen_random_uuid()),
    (v_employee, 'in', '2026-03-10 21:00:00+01', 'manual', gen_random_uuid()),
    (v_employee, 'ut', '2026-03-11 05:00:00+01', 'manual', gen_random_uuid()),
    -- Nattpass över övergången: lokalt 22:00 (+02) → 06:00 (+01) = 20:00Z → 05:00Z
    -- = 9 verkliga timmar, eftersom lokala 02-timmen inträffar två gånger.
    (v_employee, 'in', '2026-10-24 22:00:00+02', 'manual', gen_random_uuid()),
    (v_employee, 'ut', '2026-10-25 06:00:00+01', 'manual', gen_random_uuid());

  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.arbetsdag) INTO v_normal
  FROM public.berakna_arbetstid(v_employee, '2026-03-10', '2026-03-11') x;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.arbetsdag) INTO v_midnight
  FROM public.berakna_arbetstid(v_employee, '2026-03-10', '2026-03-11') x;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.arbetsdag) INTO v_dst
  FROM public.berakna_arbetstid(v_employee, '2026-10-24', '2026-10-25') x;

  SELECT COALESCE(sum(x.total_minutes), 0) INTO v_dst_total
  FROM public.berakna_arbetstid(v_employee, '2026-10-24', '2026-10-25') x;
  IF v_dst_total <> 540 THEN
    RAISE EXCEPTION 'q. DST-nattpass FEL: % minuter, facit 540', v_dst_total;
  END IF;

  RAISE NOTICE 'a–d idempotens: OK, en rad per client_punch_id';
  RAISE NOTICE 'e–h normal/beräkning: %', COALESCE(v_normal, '[]'::jsonb);
  RAISE NOTICE 'i–n midnatt: %', COALESCE(v_midnight, '[]'::jsonb);
  RAISE NOTICE 'q oktober dubbel 02 (facit 540 min): % → % min', COALESCE(v_dst, '[]'::jsonb), v_dst_total;
  RAISE NOTICE 'r–w: OK, alla testposter rullas tillbaka';

END $$;

ROLLBACK;
