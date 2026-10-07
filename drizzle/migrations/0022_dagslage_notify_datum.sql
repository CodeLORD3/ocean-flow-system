CREATE OR REPLACE FUNCTION public.dagslage_notify(_dry_run boolean DEFAULT true, _day date DEFAULT NULL, _ignore_hours boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now_se timestamp := now() AT TIME ZONE 'Europe/Stockholm';
  _d date := coalesce(_day, _now_se::date);
  l jsonb; n int; uids uuid[]; uid uuid;
  checks text[] := ARRAY['instampling','bestallning','dagsrapport'];
  verb jsonb := '{"instampling":"stämplat in","bestallning":"lagt beställning","dagsrapport":"skickat dagsrapport"}';
  c text; done jsonb := '{}'; already jsonb := '{}'; out jsonb := '[]'; msg text; last_b jsonb; ts timestamp;
  all_done boolean; pending text[] := '{}';
BEGIN
  IF NOT _ignore_hours AND (extract(hour FROM _now_se) < 6 OR extract(hour FROM _now_se) >= 23) THEN
    RETURN jsonb_build_object('hoppade_over', 'utanför 06–23');
  END IF;
  l := public._dagslage(_d);
  n := (l->>'antal')::int;
  SELECT array_agg(x::uuid) INTO uids FROM jsonb_array_elements_text(
    coalesce((SELECT value->'user_ids' FROM system_settings WHERE key = 'dagslage_notis_mottagare'), '[]')) x;
  IF n = 0 OR uids IS NULL THEN RETURN jsonb_build_object('lage', l, 'notiser', out, 'mottagare', to_jsonb(uids)); END IF;

  FOREACH c IN ARRAY checks LOOP
    done := done || jsonb_build_object(c, NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l->'butiker') b WHERE b->>c IS NULL));
    already := already || jsonb_build_object(c, EXISTS (SELECT 1 FROM notifications WHERE dedupe_key LIKE 'dagslage:'||c||':'||_d||':%'));
    IF (done->>c)::boolean AND NOT (already->>c)::boolean THEN pending := pending || c; END IF;
  END LOOP;
  all_done := (done->>'instampling')::boolean AND (done->>'bestallning')::boolean AND (done->>'dagsrapport')::boolean;

  FOREACH c IN ARRAY pending LOOP
    SELECT b INTO last_b FROM jsonb_array_elements(l->'butiker') b ORDER BY (b->>c)::timestamptz DESC LIMIT 1;
    ts := ((last_b->>c)::timestamptz) AT TIME ZONE 'Europe/Stockholm';
    msg := format('Alla %s butiker har %s. Sist: %s kl %s%s.', n, verb->>c, last_b->>'namn', to_char(ts, 'HH24:MI'),
                  CASE WHEN ts::date <> _d THEN to_char(ts, ' (FMDD/FMMM)') ELSE '' END);
    IF all_done AND c = pending[array_length(pending,1)] THEN msg := msg || ' Allt klart för dagen.'; END IF;
    FOREACH uid IN ARRAY uids LOOP
      out := out || jsonb_build_object('kontroll', c, 'user_id', uid, 'message', msg, 'dedupe_key', 'dagslage:'||c||':'||_d||':'||uid);
      IF NOT _dry_run THEN
        INSERT INTO notifications(user_id, portal, target_page, message, entity_type, dedupe_key)
        VALUES (uid, 'wholesale', '/organisation', msg, 'dagslage', 'dagslage:'||c||':'||_d||':'||uid)
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('lage', l, 'klara', done, 'redan_skickade', already, 'notiser', out, 'torrkorning', _dry_run);
END $$;
REVOKE ALL ON FUNCTION public.dagslage_notify(boolean, date, boolean) FROM PUBLIC, anon, authenticated;