
INSERT INTO public.work_sites (legal_entity_id, store_id, name, kind, cost_center, posting_cost_center, is_own_premises, ledger_required, geofence_lat, geofence_lng, geofence_radius_m, allow_mobile_punch, sort_order, is_active)
SELECT 'de-no1', s.id, v.site_name, 'butik', '2010', '2010', true, 'ja', s.latitude, s.longitude, 150, true, 10, true
FROM (VALUES ('eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7'::uuid, 'Ålstens Fisk'), ('b541f4c6-1ac0-4127-8af3-761ce3ecbbd7'::uuid, 'Kungsholmen')) v(store_id, site_name)
JOIN public.stores s ON s.id = v.store_id
WHERE NOT EXISTS (SELECT 1 FROM public.work_sites w WHERE w.store_id = v.store_id);

UPDATE public.work_sites SET is_active = false, updated_at = now()
WHERE id = '74f276f9-6234-4fb3-b607-c22bc9325861';

ALTER TABLE public.time_entries DROP CONSTRAINT time_entries_source_check;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_source_check
  CHECK (source = ANY (ARRAY['clock','manual','correction','import','personalkollen']));

ALTER TABLE public.wrong_system_punches ADD COLUMN IF NOT EXISTS handled_at timestamptz, ADD COLUMN IF NOT EXISTS handled_note text;

INSERT INTO public.system_settings (key, value) VALUES ('pk_import_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.pk_time_imports (
  pk_logged_time_id uuid PRIMARY KEY,
  identifier uuid,
  employee_id uuid,
  store_id uuid,
  work_site_id uuid,
  status text NOT NULL,
  moved_from_admin boolean NOT NULL DEFAULT false,
  in_entry_id uuid,
  ut_entry_id uuid,
  imported_start timestamptz,
  imported_stop timestamptz,
  pk_start timestamptz,
  pk_stop timestamptz,
  work_date date,
  hours numeric,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_time_imports_status_check CHECK (status IN ('importerad','matchad_egen','ej_kopplad','ej_mappad','avbokad','fel'))
);
GRANT SELECT ON public.pk_time_imports TO authenticated;
GRANT ALL ON public.pk_time_imports TO service_role;
ALTER TABLE public.pk_time_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser PK-import" ON public.pk_time_imports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.pk_import_run(_from date DEFAULT DATE '2026-09-16')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  imp public.pk_time_imports%ROWTYPE;
  v_emp uuid; v_store uuid; v_site uuid; v_moved boolean; v_s timestamptz; v_e timestamptz;
  v_in uuid; v_ut uuid; v_new uuid; v_status text;
  n_new int := 0; n_corr int := 0; n_skip int := 0; n_err int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör';
  END IF;
  IF coalesce((SELECT value FROM system_settings WHERE key='pk_import_enabled'), 'true'::jsonb) <> 'true'::jsonb THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  FOR r IN
    SELECT l.id, l.identifier, l.is_canceled, coalesce(l.real_start, l.start) s, coalesce(l.real_stop, l.stop) e,
           st.employee_id, c.short_identifier cg, c.store_id cg_store, st.connection_id, st.url staff_url
    FROM pk_logged_times l
    LEFT JOIN pk_staff st ON st.url = l.staff_url AND st.connection_id = l.connection_id
    LEFT JOIN pk_costgroups c ON c.url = l.costgroup_url AND c.connection_id = l.connection_id
    WHERE l.start >= (_from::timestamp AT TIME ZONE 'Europe/Stockholm') AND l.identifier IS NOT NULL
    ORDER BY l.start
  LOOP
    BEGIN
      SELECT * INTO imp FROM pk_time_imports WHERE pk_logged_time_id = r.id;
      v_emp := r.employee_id; v_s := r.s; v_e := r.e; v_moved := false;

      -- Butik: DE No.1 Administration (46865) flyttas alltid till Ålsten/Kungsholmen.
      IF r.cg = 46865 THEN
        v_moved := true;
        SELECT c.store_id INTO v_store
        FROM pk_logged_times l2
        JOIN pk_costgroups c ON c.url = l2.costgroup_url AND c.connection_id = l2.connection_id
        WHERE l2.staff_url = r.staff_url AND l2.connection_id = r.connection_id AND NOT l2.is_canceled
          AND l2.start >= now() - interval '90 days'
          AND c.store_id IN ('eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7','b541f4c6-1ac0-4127-8af3-761ce3ecbbd7')
        GROUP BY c.store_id ORDER BY count(*) DESC, (c.store_id = 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7') DESC LIMIT 1;
        v_store := coalesce(v_store, 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7'::uuid);
      ELSE
        v_store := r.cg_store;
      END IF;
      SELECT id INTO v_site FROM work_sites WHERE store_id = v_store AND is_active ORDER BY sort_order LIMIT 1;

      IF imp.pk_logged_time_id IS NULL OR imp.status IN ('ej_kopplad','ej_mappad','fel','avbokad') AND imp.in_entry_id IS NULL THEN
        -- Ej importerat ännu
        v_status := NULL;
        IF r.is_canceled THEN v_status := 'avbokad';
        ELSIF v_emp IS NULL THEN v_status := 'ej_kopplad';
        ELSIF v_store IS NULL THEN v_status := 'ej_mappad';
        ELSIF imp.status = 'matchad_egen' THEN v_status := 'matchad_egen';
        ELSIF EXISTS (
          WITH eff AS (
            SELECT coalesce(c.occurred_at, t.occurred_at) at, t.type
            FROM time_entries t
            LEFT JOIN LATERAL (SELECT * FROM time_entries c WHERE c.corrects_entry_id = t.id ORDER BY c.registered_at DESC LIMIT 1) c ON true
            WHERE t.employee_id = v_emp AND t.corrects_entry_id IS NULL
              AND t.source IN ('clock','manual','correction')
              AND t.type IN ('in','ut')
              AND t.occurred_at BETWEEN v_s - interval '1 day' AND coalesce(v_e, v_s) + interval '1 day'
              AND coalesce(c.correction_kind,'') <> 'void'
          ), pairs AS (
            SELECT at s, lead(at) OVER (ORDER BY at) e_next, type, lead(type) OVER (ORDER BY at) t_next FROM eff
          )
          SELECT 1 FROM pairs p
          WHERE p.type = 'in'
            AND extract(epoch FROM (least(coalesce(v_e, now()), CASE WHEN p.t_next = 'ut' THEN p.e_next ELSE least(now(), p.s + interval '14 hours') END) - greatest(v_s, p.s))) > 900
        ) THEN v_status := 'matchad_egen';
        END IF;

        IF v_status IS NOT NULL THEN
          INSERT INTO pk_time_imports (pk_logged_time_id, identifier, employee_id, store_id, work_site_id, status, moved_from_admin, pk_start, pk_stop, work_date, hours)
          VALUES (r.id, r.identifier, v_emp, v_store, v_site, v_status, v_moved, v_s, v_e, (v_s AT TIME ZONE 'Europe/Stockholm')::date, round(extract(epoch FROM (v_e - v_s))/3600.0, 2))
          ON CONFLICT (pk_logged_time_id) DO UPDATE SET status = EXCLUDED.status, employee_id = EXCLUDED.employee_id, store_id = EXCLUDED.store_id,
            work_site_id = EXCLUDED.work_site_id, moved_from_admin = EXCLUDED.moved_from_admin, pk_start = EXCLUDED.pk_start, pk_stop = EXCLUDED.pk_stop,
            work_date = EXCLUDED.work_date, hours = EXCLUDED.hours, message = NULL, updated_at = now();
          n_skip := n_skip + 1;
          CONTINUE;
        END IF;

        INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
        VALUES (v_emp, v_store, v_site, (SELECT cost_center FROM work_sites WHERE id = v_site), 'in', v_s, now(), 'personalkollen',
          'PK-import' || CASE WHEN v_moved THEN '. Omflyttad från PK Administration' ELSE '' END,
          md5('pk:' || r.identifier || ':in')::uuid)
        ON CONFLICT (employee_id, client_punch_id) DO NOTHING RETURNING id INTO v_in;
        IF v_in IS NULL THEN SELECT id INTO v_in FROM time_entries WHERE employee_id = v_emp AND client_punch_id = md5('pk:' || r.identifier || ':in')::uuid; END IF;
        v_ut := NULL;
        IF v_e IS NOT NULL THEN
          INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
          VALUES (v_emp, v_store, v_site, (SELECT cost_center FROM work_sites WHERE id = v_site), 'ut', v_e, now(), 'personalkollen',
            'PK-import' || CASE WHEN v_moved THEN '. Omflyttad från PK Administration' ELSE '' END,
            md5('pk:' || r.identifier || ':ut')::uuid)
          ON CONFLICT (employee_id, client_punch_id) DO NOTHING RETURNING id INTO v_ut;
          IF v_ut IS NULL THEN SELECT id INTO v_ut FROM time_entries WHERE employee_id = v_emp AND client_punch_id = md5('pk:' || r.identifier || ':ut')::uuid; END IF;
        END IF;
        INSERT INTO pk_time_imports (pk_logged_time_id, identifier, employee_id, store_id, work_site_id, status, moved_from_admin, in_entry_id, ut_entry_id, imported_start, imported_stop, pk_start, pk_stop, work_date, hours)
        VALUES (r.id, r.identifier, v_emp, v_store, v_site, 'importerad', v_moved, v_in, v_ut, v_s, v_e, v_s, v_e, (v_s AT TIME ZONE 'Europe/Stockholm')::date, round(extract(epoch FROM (v_e - v_s))/3600.0, 2))
        ON CONFLICT (pk_logged_time_id) DO UPDATE SET status = 'importerad', employee_id = EXCLUDED.employee_id, store_id = EXCLUDED.store_id, work_site_id = EXCLUDED.work_site_id,
          moved_from_admin = EXCLUDED.moved_from_admin, in_entry_id = EXCLUDED.in_entry_id, ut_entry_id = EXCLUDED.ut_entry_id, imported_start = EXCLUDED.imported_start,
          imported_stop = EXCLUDED.imported_stop, pk_start = EXCLUDED.pk_start, pk_stop = EXCLUDED.pk_stop, work_date = EXCLUDED.work_date, hours = EXCLUDED.hours, message = NULL, updated_at = now();
        n_new := n_new + 1;

      ELSIF imp.status = 'importerad' THEN
        -- Redan importerat: rätta via correction vid ändring/avbokning (append-only).
        IF r.is_canceled THEN
          INSERT INTO time_entries (employee_id, store_id, work_site_id, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
          SELECT t.employee_id, t.store_id, t.work_site_id, t.type, t.occurred_at, now(), 'correction', 'void', t.id, 'PK-import: passet avbokat i Personalkollen'
          FROM time_entries t WHERE t.id IN (imp.in_entry_id, imp.ut_entry_id);
          UPDATE pk_time_imports SET status = 'avbokad', in_entry_id = NULL, ut_entry_id = NULL, pk_start = v_s, pk_stop = v_e, updated_at = now() WHERE pk_logged_time_id = r.id;
          n_corr := n_corr + 1;
        ELSE
          v_in := imp.in_entry_id; v_ut := imp.ut_entry_id;
          IF v_s IS DISTINCT FROM imp.imported_start THEN
            INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
            SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, 'in', v_s, now(), 'correction', 'replace', t.id, 'PK-import: starttid ändrad i Personalkollen'
            FROM time_entries t WHERE t.id = imp.in_entry_id RETURNING id INTO v_new;
            v_in := v_new;
          END IF;
          IF v_e IS NOT NULL AND imp.ut_entry_id IS NULL THEN
            INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, note, client_punch_id)
            SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, 'ut', v_e, now(), 'personalkollen', t.note, md5('pk:' || r.identifier || ':ut')::uuid
            FROM time_entries t WHERE t.id = imp.in_entry_id
            ON CONFLICT (employee_id, client_punch_id) DO NOTHING RETURNING id INTO v_new;
            v_ut := coalesce(v_new, (SELECT id FROM time_entries WHERE employee_id = imp.employee_id AND client_punch_id = md5('pk:' || r.identifier || ':ut')::uuid));
          ELSIF v_e IS DISTINCT FROM imp.imported_stop AND imp.ut_entry_id IS NOT NULL THEN
            INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
            SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, 'ut', coalesce(v_e, t.occurred_at), now(), 'correction',
                   CASE WHEN v_e IS NULL THEN 'void' ELSE 'replace' END, t.id, 'PK-import: sluttid ändrad i Personalkollen'
            FROM time_entries t WHERE t.id = imp.ut_entry_id RETURNING id INTO v_new;
            v_ut := CASE WHEN v_e IS NULL THEN NULL ELSE v_new END;
          END IF;
          IF v_in IS DISTINCT FROM imp.in_entry_id OR v_ut IS DISTINCT FROM imp.ut_entry_id THEN
            UPDATE pk_time_imports SET in_entry_id = v_in, ut_entry_id = v_ut, imported_start = v_s, imported_stop = v_e, pk_start = v_s, pk_stop = v_e,
              hours = round(extract(epoch FROM (v_e - v_s))/3600.0, 2), updated_at = now() WHERE pk_logged_time_id = r.id;
            n_corr := n_corr + 1;
          END IF;
        END IF;
      ELSE
        -- matchad_egen eller avbokad med tidigare poster: bara uppdatera PK-tider.
        UPDATE pk_time_imports SET pk_start = v_s, pk_stop = v_e, hours = round(extract(epoch FROM (v_e - v_s))/3600.0, 2),
          status = CASE WHEN r.is_canceled THEN 'avbokad' ELSE status END, updated_at = now()
        WHERE pk_logged_time_id = r.id AND (pk_start IS DISTINCT FROM v_s OR pk_stop IS DISTINCT FROM v_e OR (r.is_canceled AND status <> 'avbokad'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      n_err := n_err + 1;
      INSERT INTO pk_time_imports (pk_logged_time_id, identifier, employee_id, store_id, work_site_id, status, moved_from_admin, pk_start, pk_stop, work_date, message)
      VALUES (r.id, r.identifier, v_emp, v_store, v_site, 'fel', v_moved, v_s, v_e, (v_s AT TIME ZONE 'Europe/Stockholm')::date, left(SQLERRM, 500))
      ON CONFLICT (pk_logged_time_id) DO UPDATE SET message = EXCLUDED.message, updated_at = now(),
        status = CASE WHEN pk_time_imports.status = 'importerad' THEN 'importerad' ELSE 'fel' END;
    END;
  END LOOP;

  -- Fel-system-flaggor som täcks av importen räknas som hanterade.
  UPDATE wrong_system_punches w SET handled_at = now(), handled_note = 'Täckt av Personalkollen-import', updated_at = now()
  WHERE w.handled_at IS NULL AND w.work_date >= _from
    AND EXISTS (SELECT 1 FROM pk_time_imports i WHERE i.employee_id = w.employee_id AND i.work_date = w.work_date AND i.status IN ('importerad','matchad_egen'));

  RETURN jsonb_build_object('enabled', true, 'nya', n_new, 'rattelser', n_corr, 'ovriga', n_skip, 'fel', n_err);
END $$;
REVOKE ALL ON FUNCTION public.pk_import_run(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pk_import_run(date) TO authenticated, service_role;
