CREATE TABLE public.store_cleaning_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  dag date NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  signed_by_user uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by_user uuid,
  undone_by_name text
);
CREATE UNIQUE INDEX store_cleaning_one_active ON public.store_cleaning_signatures(store_id, dag) WHERE undone_at IS NULL;
GRANT SELECT ON public.store_cleaning_signatures TO authenticated;
GRANT ALL ON public.store_cleaning_signatures TO service_role;
ALTER TABLE public.store_cleaning_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal ser städsignaturer för synliga butiker" ON public.store_cleaning_signatures
  FOR SELECT TO authenticated USING (public.is_staff() AND public.can_see_store(store_id));

CREATE OR REPLACE FUNCTION public.sign_store_cleaning(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.staff; _dag date := (now() AT TIME ZONE 'Europe/Stockholm')::date; _name text; r public.store_cleaning_signatures;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  SELECT * INTO s FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Kontot är inte kopplat till någon personal'; END IF;
  IF NOT public.can_see_store(_store_id) THEN RAISE EXCEPTION 'Ingen behörighet för butiken'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = _store_id AND unit_type = 'butik') THEN
    RAISE EXCEPTION 'Städsignatur gäller bara butiker'; END IF;
  _name := nullif(trim(concat_ws(' ', s.first_name, s.last_name)), '');
  IF _name IS NULL THEN RAISE EXCEPTION 'Personalen saknar namn'; END IF;
  IF EXISTS (SELECT 1 FROM public.store_cleaning_signatures WHERE store_id = _store_id AND dag = _dag AND undone_at IS NULL) THEN
    RAISE EXCEPTION 'Städningen är redan signerad i dag'; END IF;
  INSERT INTO public.store_cleaning_signatures(store_id, dag, staff_id, staff_name, signed_by_user)
  VALUES (_store_id, _dag, s.id, _name, auth.uid()) RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.undo_store_cleaning(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.store_cleaning_signatures; s public.staff;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  SELECT * INTO r FROM public.store_cleaning_signatures WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR r.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Ingen gällande signatur'; END IF;
  IF r.dag <> (now() AT TIME ZONE 'Europe/Stockholm')::date THEN RAISE EXCEPTION 'Kan bara ångras samma dag'; END IF;
  IF r.signed_by_user <> auth.uid() AND NOT public.is_hr_admin() THEN
    RAISE EXCEPTION 'Bara den som signerade eller admin kan ångra'; END IF;
  SELECT * INTO s FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  UPDATE public.store_cleaning_signatures SET undone_at = now(), undone_by_user = auth.uid(),
    undone_by_name = coalesce(nullif(trim(concat_ws(' ', s.first_name, s.last_name)), ''), 'Okänd')
  WHERE id = _id RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.sign_store_cleaning(uuid), public.undo_store_cleaning(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_store_cleaning(uuid), public.undo_store_cleaning(uuid) TO authenticated;

-- Beställning grossist räknar även shop_orders (inte Avbruten), samma datumregel.
CREATE OR REPLACE FUNCTION public.dagsavslut_status(_store_id uuid, _day date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with d as (select coalesce(_day, (now() at time zone 'Europe/Stockholm')::date) as dag)
  select jsonb_build_object(
    'dag', d.dag,
    'dagsrapport_klar', exists (
      select 1 from daily_reports r where r.store_id = _store_id and r.report_date = d.dag
    ),
    'inventering_klar', exists (
      select 1 from inventory_reports ir
      where ir.store_id = _store_id and ir.approved_at is not null
        and (ir.reported_at at time zone 'Europe/Stockholm')::date = d.dag
    ) or exists (
      select 1 from daily_stock_sheets ds
      where ds.store_id = _store_id and ds.location_id is null and ds.status = 'godkand' and ds.sheet_date = d.dag
    ),
    'grossistorder_klar', exists (
      select 1 from store_replenishment_orders o
      where o.store_id = _store_id and o.sent_at is not null and o.cancelled_at is null
        and (o.wanted_date >= d.dag or (o.created_at at time zone 'Europe/Stockholm')::date = d.dag)
    ) or exists (
      select 1 from shop_orders so
      where so.store_id = _store_id and so.status <> 'Avbruten'
        and (so.desired_delivery_date >= d.dag or (so.created_at at time zone 'Europe/Stockholm')::date = d.dag)
    ) or exists (
      select 1 from dagsavslut_kvitteringar k where k.store_id = _store_id and k.dag = d.dag and k.vad = 'grossist'
    ),
    'inkop_klar', exists (
      select 1 from purchase_report_lines l where l.purchase_date = d.dag
    ) or exists (
      select 1 from dagsavslut_kvitteringar k where k.store_id = _store_id and k.dag = d.dag and k.vad = 'inkop'
    )
  )
  from d;
$function$;

-- Läget för alla räknade butiker. Används av både notisen och admins startsida.
CREATE OR REPLACE FUNCTION public._dagslage(_day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH st AS (
    SELECT s.id, s.name FROM stores s
    WHERE coalesce(s.active, true) AND s.unit_type = 'butik' AND s.name !~* '^Testbutik'
      AND s.clock_active_from IS NOT NULL AND s.clock_active_from <= _day
      AND EXISTS (SELECT 1 FROM shifts sh WHERE sh.store_id = s.id AND sh.date = _day
                  AND sh.status = 'published' AND sh.employee_id IS NOT NULL)
  ), t AS (
    SELECT st.id, st.name,
      (SELECT min(te.occurred_at) FROM time_entries te JOIN employees e ON e.id = te.employee_id
        WHERE te.store_id = st.id AND te.arbetsdag = _day AND coalesce(e.is_test,false) = false) AS in_at,
      CASE WHEN (dagsavslut_status(st.id, _day)->>'grossistorder_klar')::boolean THEN
        coalesce(least(
          (SELECT min(o.created_at) FROM store_replenishment_orders o WHERE o.store_id = st.id AND o.sent_at IS NOT NULL AND o.cancelled_at IS NULL
             AND (o.wanted_date >= _day OR (o.created_at AT TIME ZONE 'Europe/Stockholm')::date = _day)),
          (SELECT min(so.created_at) FROM shop_orders so WHERE so.store_id = st.id AND so.status <> 'Avbruten'
             AND (so.desired_delivery_date >= _day OR (so.created_at AT TIME ZONE 'Europe/Stockholm')::date = _day)),
          (SELECT min(k.created_at) FROM dagsavslut_kvitteringar k WHERE k.store_id = st.id AND k.dag = _day AND k.vad = 'grossist')
        ), now()) END AS order_at,
      (SELECT min(r.created_at) FROM daily_reports r WHERE r.store_id = st.id AND r.report_date = _day) AS report_at
    FROM st
  )
  SELECT jsonb_build_object(
    'dag', _day,
    'antal', (SELECT count(*) FROM t),
    'butiker', coalesce((SELECT jsonb_agg(jsonb_build_object('store_id', id, 'namn', name,
        'instampling', in_at, 'bestallning', order_at, 'dagsrapport', report_at) ORDER BY name) FROM t), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public._dagslage(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dagslage(_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Endast admin'; END IF;
  RETURN public._dagslage(coalesce(_day, (now() AT TIME ZONE 'Europe/Stockholm')::date));
END $$;
REVOKE ALL ON FUNCTION public.dagslage(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dagslage(date) TO authenticated;

-- Skickar (eller torrkör) notiserna. Mottagare: system_settings 'dagslage_notis_mottagare' = {"user_ids":[...]}.
CREATE OR REPLACE FUNCTION public.dagslage_notify(_dry_run boolean DEFAULT true, _day date DEFAULT NULL, _ignore_hours boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now_se timestamp := now() AT TIME ZONE 'Europe/Stockholm';
  _d date := coalesce(_day, _now_se::date);
  l jsonb; n int; uids uuid[]; uid uuid;
  checks text[] := ARRAY['instampling','bestallning','dagsrapport'];
  verb jsonb := '{"instampling":"stämplat in","bestallning":"lagt beställning","dagsrapport":"skickat dagsrapport"}';
  c text; done jsonb := '{}'; already jsonb := '{}'; out jsonb := '[]'; msg text; last_b jsonb;
  all_done boolean; pending text[] := '{}'; sent_other int;
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
    msg := format('Alla %s butiker har %s. Sist: %s kl %s.', n, verb->>c, last_b->>'namn',
                  to_char(((last_b->>c)::timestamptz) AT TIME ZONE 'Europe/Stockholm', 'HH24:MI'));
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