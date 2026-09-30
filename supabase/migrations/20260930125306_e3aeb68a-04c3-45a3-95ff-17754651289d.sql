ALTER TABLE public.pk_time_imports
  ADD COLUMN IF NOT EXISTS entry_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS own_in_id uuid,
  ADD COLUMN IF NOT EXISTS own_ut_id uuid,
  ADD COLUMN IF NOT EXISTS own_start timestamptz,
  ADD COLUMN IF NOT EXISTS own_stop timestamptz,
  ADD COLUMN IF NOT EXISTS pk_minutes integer,
  ADD COLUMN IF NOT EXISTS own_minutes integer,
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('pk','egen','andring')),
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending jsonb;
ALTER TABLE public.pk_time_imports DROP CONSTRAINT IF EXISTS pk_time_imports_status_check;
ALTER TABLE public.pk_time_imports ADD CONSTRAINT pk_time_imports_status_check CHECK (status IN
  ('importerad','matchad_egen','ej_kopplad','ej_mappad','avbokad','fel','konflikt','saknar_utstampling','vantar_attest'));
UPDATE public.pk_time_imports SET entry_ids = array_remove(array[in_entry_id, ut_entry_id], NULL)
 WHERE cardinality(entry_ids) = 0 AND in_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.te_effective_leaf(_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE cur uuid := _id; c record;
BEGIN
  LOOP
    SELECT id, correction_kind INTO c FROM time_entries WHERE corrects_entry_id = cur ORDER BY registered_at DESC, id DESC LIMIT 1;
    IF NOT FOUND THEN RETURN cur; END IF;
    IF c.correction_kind = 'void' THEN RETURN NULL; END IF;
    cur := c.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pk_own_journal(_emp uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, in_id uuid, ut_id uuid, s timestamptz, e timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH j AS (
    SELECT te.id, te.type, coalesce(te.rounded_at, te.occurred_at) at
    FROM time_entries te
    WHERE te.employee_id = _emp AND te.type IN ('in','ut')
      AND te.occurred_at BETWEEN _from AND _to
      AND te.correction_kind IS DISTINCT FROM 'void'
      AND NOT EXISTS (SELECT 1 FROM time_entries c WHERE c.corrects_entry_id = te.id)
      AND te.source <> 'personalkollen' AND coalesce(te.note,'') NOT LIKE 'PK-import%'
  ), o AS (
    SELECT j.*, lead(type) OVER w nt, lead(at) OVER w na, lead(id) OVER w nid, lag(type) OVER w pt
    FROM j WINDOW w AS (ORDER BY at, id)
  )
  SELECT 'par', id, nid, at, na FROM o WHERE type='in' AND nt='ut'
  UNION ALL SELECT 'ensam_in', id, NULL, at, NULL FROM o WHERE type='in' AND coalesce(nt,'in') <> 'ut'
  UNION ALL SELECT 'ensam_ut', NULL, id, NULL, at FROM o WHERE type='ut' AND coalesce(pt,'ut') <> 'in'
$$;

CREATE OR REPLACE FUNCTION public.pk_import_run(_from date DEFAULT '2026-09-16', _only uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; imp pk_time_imports%ROWTYPE; b record;
  v_emp uuid; v_store uuid; v_site uuid; v_cc text; v_moved boolean; v_s timestamptz; v_e timestamptz;
  v_status text; v_want boolean; v_fp text; v_have uuid[]; v_leaf uuid; v_id uuid; v_ids uuid[];
  v_gen int; v_pkmin int; v_ownmin int; v_locked boolean; v_note text; v_i int;
  v_oin uuid; v_out uuid; v_os timestamptz; v_oe timestamptz; v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  n_new int := 0; n_corr int := 0; n_pend int := 0; n_err int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') AND _only IS NULL THEN RAISE EXCEPTION 'Endast administratör'; END IF;
  IF coalesce((SELECT value FROM system_settings WHERE key='pk_import_enabled'), 'true'::jsonb) <> 'true'::jsonb THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  FOR r IN
    SELECT l.id, l.identifier, l.is_canceled, coalesce(l.real_start, l.start) s, coalesce(l.real_stop, l.stop) e,
           l.work_time_sec, l.breaks_duration_sec, l.breaks,
           st.employee_id, c.short_identifier cg, c.store_id cg_store, st.connection_id, st.url staff_url,
           coalesce(em.is_test, false) is_test
    FROM pk_logged_times l
    LEFT JOIN pk_staff st ON st.url = l.staff_url AND st.connection_id = l.connection_id
    LEFT JOIN pk_costgroups c ON c.url = l.costgroup_url AND c.connection_id = l.connection_id
    LEFT JOIN employees em ON em.id = st.employee_id
    WHERE l.start >= (_from::timestamp AT TIME ZONE 'Europe/Stockholm') AND l.identifier IS NOT NULL
      AND (_only IS NULL OR l.id = _only)
    ORDER BY l.start
  LOOP
    BEGIN
      imp := NULL;
      SELECT * INTO imp FROM pk_time_imports WHERE pk_logged_time_id = r.id;
      v_emp := r.employee_id; v_s := r.s; v_e := r.e; v_moved := false;
      IF r.cg = 46865 THEN
        v_moved := true;
        SELECT c.store_id INTO v_store FROM pk_logged_times l2
        JOIN pk_costgroups c ON c.url = l2.costgroup_url AND c.connection_id = l2.connection_id
        WHERE l2.staff_url = r.staff_url AND l2.connection_id = r.connection_id AND NOT l2.is_canceled
          AND l2.start >= now() - interval '90 days'
          AND c.store_id IN ('eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7','b541f4c6-1ac0-4127-8af3-761ce3ecbbd7')
        GROUP BY c.store_id ORDER BY count(*) DESC, (c.store_id = 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7') DESC LIMIT 1;
        v_store := coalesce(v_store, 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7'::uuid);
      ELSE v_store := r.cg_store; END IF;
      v_site := NULL; v_cc := NULL;
      SELECT id, cost_center INTO v_site, v_cc FROM work_sites WHERE store_id = v_store AND is_active ORDER BY sort_order LIMIT 1;
      v_pkmin := CASE WHEN v_e IS NULL THEN NULL ELSE round(extract(epoch FROM v_e - v_s)/60)::int END;
      v_fp := md5(coalesce(v_s::text,'') || '|' || coalesce(v_e::text,'') || '|' || coalesce(v_store::text,'') || '|' ||
                  CASE WHEN coalesce(r.breaks_duration_sec,0) > 0 THEN coalesce(r.breaks::text,'') ELSE '' END);
      v_oin := NULL; v_out := NULL; v_os := NULL; v_oe := NULL; v_ownmin := NULL;

      v_want := false;
      IF r.is_canceled THEN v_status := 'avbokad';
      ELSIF v_emp IS NULL THEN v_status := 'ej_kopplad';
      ELSIF r.is_test THEN v_status := 'fel';
      ELSIF v_store IS NULL THEN v_status := 'ej_mappad';
      ELSE
        SELECT o.in_id, o.ut_id, o.s, o.e INTO v_oin, v_out, v_os, v_oe FROM pk_own_journal(v_emp, v_s - interval '1 day', coalesce(v_e, v_s) + interval '1 day') o
        WHERE o.kind = 'par'
          AND extract(epoch FROM least(coalesce(v_e, o.e), o.e) - greatest(v_s, o.s)) > 900
        ORDER BY least(coalesce(v_e, o.e), o.e) - greatest(v_s, o.s) DESC LIMIT 1;
        IF v_oin IS NOT NULL THEN
          v_ownmin := round(extract(epoch FROM v_oe - v_os)/60)::int;
          IF imp.decision = 'pk' THEN v_status := 'importerad'; v_want := true;
          ELSIF imp.decision = 'egen' OR v_e IS NULL OR abs(v_ownmin - v_pkmin) <= 30 THEN v_status := 'matchad_egen';
          ELSE v_status := 'konflikt'; END IF;
        ELSE
          v_want := true;
          v_status := CASE WHEN v_e IS NULL AND (v_s AT TIME ZONE 'Europe/Stockholm')::date < v_today THEN 'saknar_utstampling' ELSE 'importerad' END;
        END IF;
      END IF;

      v_have := '{}';
      IF imp.pk_logged_time_id IS NOT NULL THEN
        FOREACH v_id IN ARRAY coalesce(imp.entry_ids, '{}') LOOP
          v_leaf := te_effective_leaf(v_id);
          IF v_leaf IS NOT NULL THEN v_have := v_have || v_leaf; END IF;
        END LOOP;
      END IF;

      IF (v_want AND (cardinality(v_have) = 0 OR imp.fingerprint IS DISTINCT FROM v_fp))
         OR (NOT v_want AND cardinality(v_have) > 0) THEN
        IF cardinality(v_have) > 0 AND imp.decision IS DISTINCT FROM 'andring' THEN
          v_locked := public.period_is_locked(imp.store_id, imp.work_date)
            OR EXISTS (SELECT 1 FROM attestations a WHERE a.employee_id = imp.employee_id AND a.date = imp.work_date
                       AND a.status IN ('approved','auto_approved'));
          IF v_locked THEN
            IF NOT public.period_is_locked(imp.store_id, imp.work_date) THEN
              UPDATE attestations SET status = 'flagged', updated_at = now()
              WHERE employee_id = imp.employee_id AND date = imp.work_date AND status IN ('approved','auto_approved');
            END IF;
            UPDATE pk_time_imports SET status = 'vantar_attest', updated_at = now(),
              pending = jsonb_build_object('ny_status', v_status, 'pk_start', v_s, 'pk_stop', v_e, 'avbokad', r.is_canceled, 'fingerprint', v_fp),
              message = 'Passet ändrat i Personalkollen efter attest/låsning – kräver ny attest'
            WHERE pk_logged_time_id = r.id;
            n_pend := n_pend + 1;
            CONTINUE;
          END IF;
        END IF;

        v_note := CASE WHEN r.is_canceled THEN 'PK-import: passet avbokat i Personalkollen'
                       WHEN v_status IN ('matchad_egen','konflikt') THEN 'PK-import: ersätts av egen klocka (' || v_status || ')'
                       ELSE 'PK-import: passet ändrat i Personalkollen' END;
        INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
        SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, t.type, t.occurred_at, now(), 'correction', 'void', t.id, v_note
        FROM time_entries t WHERE t.id = ANY (v_have);
        IF cardinality(v_have) > 0 THEN n_corr := n_corr + 1; END IF;

        v_ids := '{}';
        IF v_want THEN
          v_gen := 0;
          WHILE EXISTS (SELECT 1 FROM time_entries WHERE employee_id = v_emp AND client_punch_id =
                 md5('pk:' || r.identifier || ':in' || CASE WHEN v_gen = 0 THEN '' ELSE ':' || v_gen END)::uuid) LOOP
            v_gen := v_gen + 1;
          END LOOP;
          v_note := 'PK-import' || CASE WHEN v_moved THEN '. Omflyttad från PK Administration' ELSE '' END;
          INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
          VALUES (v_emp, v_store, v_site, v_cc, 'in', v_s, now(), 'personalkollen', v_note,
                  md5('pk:' || r.identifier || ':in' || CASE WHEN v_gen = 0 THEN '' ELSE ':' || v_gen END)::uuid) RETURNING id INTO v_id;
          v_ids := v_ids || v_id;
          IF v_e IS NOT NULL THEN
            v_i := 0;
            IF coalesce(r.breaks_duration_sec, 0) > 0 THEN
              FOR b IN SELECT (x->>'start')::timestamptz bs, (x->>'stop')::timestamptz be
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.breaks) = 'array' THEN r.breaks ELSE '[]'::jsonb END) x
                       WHERE x->>'start' IS NOT NULL AND x->>'stop' IS NOT NULL ORDER BY 1 LOOP
                CONTINUE WHEN b.be <= b.bs OR b.bs < v_s OR b.be > v_e;
                v_i := v_i + 1;
                INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
                VALUES (v_emp, v_store, v_site, v_cc, 'rast_start', b.bs, now(), 'personalkollen', v_note, md5('pk:' || r.identifier || ':rs' || v_i || ':' || v_gen)::uuid) RETURNING id INTO v_id;
                v_ids := v_ids || v_id;
                INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
                VALUES (v_emp, v_store, v_site, v_cc, 'rast_slut', b.be, now(), 'personalkollen', v_note, md5('pk:' || r.identifier || ':re' || v_i || ':' || v_gen)::uuid) RETURNING id INTO v_id;
                v_ids := v_ids || v_id;
              END LOOP;
              IF v_i = 0 THEN
                INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
                VALUES (v_emp, v_store, v_site, v_cc, 'rast_start', v_s + (v_e - v_s)/2, now(), 'personalkollen', v_note, md5('pk:' || r.identifier || ':rs0:' || v_gen)::uuid) RETURNING id INTO v_id;
                v_ids := v_ids || v_id;
                INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
                VALUES (v_emp, v_store, v_site, v_cc, 'rast_slut', v_s + (v_e - v_s)/2 + make_interval(secs => r.breaks_duration_sec), now(), 'personalkollen', v_note, md5('pk:' || r.identifier || ':re0:' || v_gen)::uuid) RETURNING id INTO v_id;
                v_ids := v_ids || v_id;
              END IF;
            END IF;
            INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
            VALUES (v_emp, v_store, v_site, v_cc, 'ut', v_e, now(), 'personalkollen', v_note,
                    md5('pk:' || r.identifier || ':ut' || CASE WHEN v_gen = 0 THEN '' ELSE ':' || v_gen END)::uuid) RETURNING id INTO v_id;
            v_ids := v_ids || v_id;
          END IF;
          n_new := n_new + 1;
        END IF;
      ELSE
        v_ids := v_have;
      END IF;

      INSERT INTO pk_time_imports AS t (pk_logged_time_id, identifier, employee_id, store_id, work_site_id, status, moved_from_admin,
        entry_ids, in_entry_id, ut_entry_id, imported_start, imported_stop, pk_start, pk_stop, work_date, hours, fingerprint,
        own_in_id, own_ut_id, own_start, own_stop, own_minutes, pk_minutes, pending, message)
      VALUES (r.id, r.identifier, v_emp, v_store, v_site, v_status, v_moved,
        v_ids, CASE WHEN v_want THEN v_ids[1] END, CASE WHEN v_want AND v_e IS NOT NULL THEN v_ids[cardinality(v_ids)] END,
        CASE WHEN v_want THEN v_s END, CASE WHEN v_want THEN v_e END, v_s, v_e,
        (v_s AT TIME ZONE 'Europe/Stockholm')::date, round(extract(epoch FROM (v_e - v_s))/3600.0, 2),
        CASE WHEN v_want THEN v_fp END, v_oin, v_out, v_os, v_oe, v_ownmin, v_pkmin, NULL,
        CASE WHEN r.is_test THEN 'Testperson – importeras inte' WHEN v_status = 'konflikt' THEN 'Egen klocka och PK skiljer mer än 30 min – chefen väljer i attesten' END)
      ON CONFLICT (pk_logged_time_id) DO UPDATE SET status = EXCLUDED.status, employee_id = EXCLUDED.employee_id, store_id = EXCLUDED.store_id,
        work_site_id = EXCLUDED.work_site_id, moved_from_admin = EXCLUDED.moved_from_admin, entry_ids = EXCLUDED.entry_ids,
        in_entry_id = EXCLUDED.in_entry_id, ut_entry_id = EXCLUDED.ut_entry_id, imported_start = EXCLUDED.imported_start,
        imported_stop = EXCLUDED.imported_stop, pk_start = EXCLUDED.pk_start, pk_stop = EXCLUDED.pk_stop, work_date = EXCLUDED.work_date,
        hours = EXCLUDED.hours, fingerprint = EXCLUDED.fingerprint, own_in_id = EXCLUDED.own_in_id, own_ut_id = EXCLUDED.own_ut_id,
        own_start = EXCLUDED.own_start, own_stop = EXCLUDED.own_stop, own_minutes = EXCLUDED.own_minutes, pk_minutes = EXCLUDED.pk_minutes,
        pending = NULL, message = EXCLUDED.message,
        decision = CASE WHEN t.decision = 'andring' THEN NULL ELSE t.decision END,
        updated_at = CASE WHEN t.status IS DISTINCT FROM EXCLUDED.status OR t.entry_ids IS DISTINCT FROM EXCLUDED.entry_ids THEN now() ELSE t.updated_at END;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      INSERT INTO pk_time_imports (pk_logged_time_id, identifier, employee_id, store_id, work_site_id, status, moved_from_admin, pk_start, pk_stop, work_date, message)
      VALUES (r.id, r.identifier, v_emp, v_store, v_site, 'fel', v_moved, v_s, v_e, (v_s AT TIME ZONE 'Europe/Stockholm')::date, left(SQLERRM, 500))
      ON CONFLICT (pk_logged_time_id) DO UPDATE SET message = EXCLUDED.message, updated_at = now();
    END;
  END LOOP;

  INSERT INTO employee_day_flags (employee_id, date, comment)
  SELECT DISTINCT q.employee_id, q.work_date, q.c FROM (
    SELECT i.employee_id, i.work_date,
         'PK-import: ensam egen ' || CASE WHEN o.kind = 'ensam_in' THEN 'in' ELSE 'ut' END || '-stämpling kl ' ||
         to_char(coalesce(o.s, o.e) AT TIME ZONE 'Europe/Stockholm', 'HH24:MI') || ' utan motsvarande ' ||
         CASE WHEN o.kind = 'ensam_in' THEN 'ut' ELSE 'in' END || ' – PK-passet har importerats, granska i attesten' c
    FROM pk_time_imports i
    CROSS JOIN LATERAL pk_own_journal(i.employee_id, (i.work_date::timestamp AT TIME ZONE 'Europe/Stockholm'),
                                      ((i.work_date + 1)::timestamp AT TIME ZONE 'Europe/Stockholm')) o
    WHERE i.employee_id IS NOT NULL AND i.work_date >= _from AND o.kind <> 'par'
      AND (_only IS NULL OR i.pk_logged_time_id = _only)
  ) q
  WHERE NOT EXISTS (SELECT 1 FROM employee_day_flags f WHERE f.employee_id = q.employee_id AND f.date = q.work_date AND f.comment = q.c);

  UPDATE attestations a SET status = 'flagged', updated_at = now()
  FROM pk_time_imports i
  WHERE i.status = 'konflikt' AND a.employee_id = i.employee_id AND a.date = i.work_date
    AND a.status = 'auto_approved' AND NOT public.period_is_locked(a.store_id, a.date);

  UPDATE wrong_system_punches w SET handled_at = now(), handled_note = 'Täckt av Personalkollen-import', updated_at = now()
  WHERE w.handled_at IS NULL AND w.work_date >= _from
    AND EXISTS (SELECT 1 FROM pk_time_imports i WHERE i.employee_id = w.employee_id AND i.work_date = w.work_date AND i.status IN ('importerad','matchad_egen'));

  RETURN jsonb_build_object('enabled', true, 'nya', n_new, 'rattelser', n_corr, 'vantar_attest', n_pend, 'fel', n_err);
END $$;

DROP FUNCTION IF EXISTS public.pk_import_run(date);

CREATE OR REPLACE FUNCTION public.pk_import_decide(_pk_logged_time_id uuid, _decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE imp pk_time_imports%ROWTYPE;
BEGIN
  SELECT * INTO imp FROM pk_time_imports WHERE pk_logged_time_id = _pk_logged_time_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passet finns inte'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.can_manage_schedule(imp.store_id, NULL)) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  IF _decision NOT IN ('pk','egen','andring') THEN RAISE EXCEPTION 'Ogiltigt val'; END IF;
  IF _decision = 'andring' AND imp.status <> 'vantar_attest' THEN RAISE EXCEPTION 'Ingen väntande ändring'; END IF;
  IF _decision IN ('pk','egen') AND imp.status <> 'konflikt' THEN RAISE EXCEPTION 'Passet är inte i konflikt'; END IF;
  IF _decision = 'pk' THEN
    INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note, created_by)
    SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, t.type, t.occurred_at, now(), 'correction', 'void', t.id,
           'Attest: chefen valde PK-passet i stället för egen klocka', auth.uid()
    FROM time_entries t WHERE t.id IN (imp.own_in_id, imp.own_ut_id) AND te_effective_leaf(t.id) = t.id;
  END IF;
  UPDATE pk_time_imports SET decision = _decision, decided_by = auth.uid(), decided_at = now() WHERE pk_logged_time_id = _pk_logged_time_id;
  RETURN public.pk_import_run('2026-09-16', _pk_logged_time_id);
END $$;

CREATE OR REPLACE FUNCTION public.pk_link_staff(_pk_staff_id uuid, _employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Endast administratör'; END IF;
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = _employee_id AND NOT coalesce(is_test,false)) THEN RAISE EXCEPTION 'Anställd saknas'; END IF;
  UPDATE pk_staff SET employee_id = _employee_id, employee_id_manual = true WHERE id = _pk_staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PK-person saknas'; END IF;
  RETURN public.pk_import_run('2026-09-16');
END $$;

REVOKE ALL ON FUNCTION public.pk_import_decide(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pk_link_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pk_import_decide(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pk_link_staff(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pk_import_run(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pk_import_run(date, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.pk_own_journal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Chef läser PK-import" ON public.pk_time_imports;
CREATE POLICY "Chef läser PK-import" ON public.pk_time_imports FOR SELECT TO authenticated
  USING (public.can_manage_schedule(store_id, NULL));

CREATE OR REPLACE FUNCTION public.pk_reconcile_check(_ts timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb; n int; v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
BEGIN
  WITH pk AS (
    SELECT l.id, coalesce(l.real_start,l.start) s, coalesce(l.real_stop,l.stop) e
    FROM pk_logged_times l
    WHERE NOT l.is_canceled AND l.start >= '2026-09-15 22:00+00' AND (l.start AT TIME ZONE 'Europe/Stockholm')::date < v_today
  ), a AS (
    SELECT 'ej_forklarad' typ, count(*) n, jsonb_agg(jsonb_build_object('pass', pk.id, 'dag', (pk.s AT TIME ZONE 'Europe/Stockholm')::date, 'status', i.status)) x
    FROM pk LEFT JOIN pk_time_imports i ON i.pk_logged_time_id = pk.id
    WHERE i.pk_logged_time_id IS NULL OR i.status IN ('fel','ej_mappad','avbokad')
       OR (i.status IN ('importerad','saknar_utstampling') AND (i.imported_start IS DISTINCT FROM pk.s OR i.imported_stop IS DISTINCT FROM pk.e))
  ), b AS (
    SELECT 'status_over_24h' typ, count(*) n, jsonb_agg(jsonb_build_object('pass', pk_logged_time_id, 'dag', work_date, 'status', status)) x
    FROM pk_time_imports WHERE status IN ('konflikt','saknar_utstampling','ej_kopplad','vantar_attest') AND created_at < _ts - interval '24 hours'
  ), c AS (
    SELECT 'clock_sync_fel_over_24h' typ, count(*) n, jsonb_agg(jsonb_build_object('id', id, 'tid', occurred_at)) x
    FROM clock_sync_failures WHERE status = 'open' AND created_at < _ts - interval '24 hours'
  ), eff AS (
    SELECT t.* FROM time_entries t JOIN employees e ON e.id = t.employee_id AND NOT coalesce(e.is_test,false)
    WHERE t.occurred_at >= '2026-09-15 22:00+00' AND t.correction_kind IS DISTINCT FROM 'void'
      AND NOT EXISTS (SELECT 1 FROM time_entries c2 WHERE c2.corrects_entry_id = t.id)
  ), dd AS (
    SELECT 'fel_arbetsstalle' typ, count(*) n, jsonb_agg(jsonb_build_object('post', eff.id, 'tid', eff.occurred_at, 'arbetsstalle', w.name)) x
    FROM eff JOIN work_sites w ON w.id = eff.work_site_id
    WHERE NOT w.is_active OR (w.legal_entity_id = 'de-no1' AND w.name ILIKE 'Administration%')
  ), ee AS (
    SELECT 'in_utan_ut_over_16h' typ, count(*) n, jsonb_agg(jsonb_build_object('anstalld', q.employee_id, 'in', q.occurred_at)) x
    FROM (SELECT DISTINCT ON (employee_id) employee_id, type, occurred_at FROM eff WHERE type IN ('in','ut')
          ORDER BY employee_id, occurred_at DESC, id DESC) q
    WHERE q.type = 'in' AND q.occurred_at < _ts - interval '16 hours'
  )
  SELECT jsonb_object_agg(typ, jsonb_build_object('antal', n, 'rader', coalesce(x, '[]'::jsonb))), sum(n)::int INTO d, n
  FROM (SELECT * FROM a UNION ALL SELECT * FROM b UNION ALL SELECT * FROM c UNION ALL SELECT * FROM dd UNION ALL SELECT * FROM ee) z;
  INSERT INTO system_checks(run_at, check_name, status, count, details)
  VALUES (_ts, 'pk_klocka_avstamning', CASE WHEN n = 0 THEN 'ok' ELSE 'fel' END, n, d);
  RETURN jsonb_build_object('antal', n, 'detaljer', d);
END $$;
REVOKE ALL ON FUNCTION public.pk_reconcile_check(timestamptz) FROM PUBLIC, anon, authenticated;

-- Körs i samma nattliga systemkontroll (samma run_at) som övriga kontroller.
CREATE OR REPLACE FUNCTION public.system_checks_pk_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.check_name = 'dagsrapport_saknas' THEN PERFORM public.pk_reconcile_check(NEW.run_at); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS system_checks_pk_hook_trg ON public.system_checks;
CREATE TRIGGER system_checks_pk_hook_trg AFTER INSERT ON public.system_checks
  FOR EACH ROW EXECUTE FUNCTION public.system_checks_pk_hook();
REVOKE ALL ON FUNCTION public.system_checks_pk_hook() FROM PUBLIC, anon, authenticated;