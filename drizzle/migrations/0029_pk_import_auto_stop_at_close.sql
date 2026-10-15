CREATE OR REPLACE FUNCTION public.pk_import_run(_from date DEFAULT '2026-09-16'::date, _only uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; imp pk_time_imports%ROWTYPE; b record;
  v_emp uuid; v_store uuid; v_site uuid; v_cc text; v_moved boolean; v_s timestamptz; v_e timestamptz;
  v_status text; v_want boolean; v_fp text; v_have uuid[]; v_leaf uuid; v_id uuid; v_ids uuid[];
  v_gen int; v_pkmin int; v_ownmin int; v_locked boolean; v_note text; v_i int;
  v_pk_e timestamptz; v_auto boolean := false; v_close time; v_day date;
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
      v_emp := r.employee_id; v_s := r.s; v_e := r.e; v_moved := false; v_pk_e := r.e; v_auto := false;
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
          -- Utstämpling saknas i PK: sätt butikens stängning + 30 min. Stängd dag eller okänd tid lämnas för granskning.
          v_day := (v_s AT TIME ZONE 'Europe/Stockholm')::date;
          IF v_e IS NULL AND v_day < v_today THEN
            v_close := NULL;
            SELECT h.close_time INTO v_close FROM store_opening_hours h
            WHERE h.store_id = v_store AND h.weekday = extract(dow FROM v_day)::int
              AND NOT coalesce(h.closed, false) AND h.close_time IS NOT NULL;
            IF v_close IS NOT NULL AND ((v_day + v_close + interval '30 minutes') AT TIME ZONE 'Europe/Stockholm') > v_s THEN
              v_e := (v_day + v_close + interval '30 minutes') AT TIME ZONE 'Europe/Stockholm';
              v_auto := true;
              v_pkmin := round(extract(epoch FROM v_e - v_s)/60)::int;
              v_fp := md5(coalesce(v_s::text,'') || '|' || coalesce(v_e::text,'') || '|' || coalesce(v_store::text,'') || '|' ||
                  CASE WHEN coalesce(r.breaks_duration_sec,0) > 0 THEN coalesce(r.breaks::text,'') ELSE '' END);
            END IF;
          END IF;
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
              pending = jsonb_build_object('ny_status', v_status, 'pk_start', v_s, 'pk_stop', v_pk_e, 'avbokad', r.is_canceled, 'fingerprint', v_fp),
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
        -- Klockans 12-timmarsavslut på PK-passet ersätts av passets riktiga/satta sluttid.
        IF v_want AND v_e IS NOT NULL THEN
          INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
          SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, t.type, t.occurred_at, now(), 'correction', 'void', t.id,
                 'PK-import: 12-timmarsavslut ersatt av passets sluttid'
          FROM time_entries t
          WHERE t.employee_id = v_emp AND t.type = 'ut' AND t.source = 'clock' AND t.correction_kind IS NULL
            AND t.note LIKE 'Automatiskt avslutad efter 12 timmar%'
            AND t.occurred_at > v_s AND t.occurred_at <= v_s + interval '13 hours'
            AND NOT EXISTS (SELECT 1 FROM time_entries c WHERE c.corrects_entry_id = t.id);
        END IF;
        IF cardinality(v_have) > 0 THEN n_corr := n_corr + 1; END IF;

        v_ids := '{}';
        IF v_want THEN
          v_gen := 0;
          WHILE EXISTS (SELECT 1 FROM time_entries WHERE employee_id = v_emp AND client_punch_id =
                 md5('pk:' || r.identifier || ':in' || CASE WHEN v_gen = 0 THEN '' ELSE ':' || v_gen END)::uuid) LOOP
            v_gen := v_gen + 1;
          END LOOP;
          v_note := 'PK-import' || CASE WHEN v_moved THEN '. Omflyttad från PK Administration' ELSE '' END
                    || CASE WHEN v_auto THEN '. Utstämpling saknades – satt till stängning + 30 min' ELSE '' END;
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
        CASE WHEN v_want THEN v_s END, CASE WHEN v_want THEN v_e END, v_s, v_pk_e,
        (v_s AT TIME ZONE 'Europe/Stockholm')::date, round(extract(epoch FROM (v_e - v_s))/3600.0, 2),
        CASE WHEN v_want THEN v_fp END, v_oin, v_out, v_os, v_oe, v_ownmin, v_pkmin, NULL,
        CASE WHEN r.is_test THEN 'Testperson – importeras inte' WHEN v_auto THEN 'Utstämpling saknades i Personalkollen – satt till butikens stängning + 30 min' WHEN v_status = 'konflikt' THEN 'Egen klocka och PK skiljer mer än 30 min – chefen väljer i attesten' END)
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
      VALUES (r.id, r.identifier, v_emp, v_store, v_site, 'fel', v_moved, v_s, v_pk_e, (v_s AT TIME ZONE 'Europe/Stockholm')::date, left(SQLERRM, 500))
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
END $function$;