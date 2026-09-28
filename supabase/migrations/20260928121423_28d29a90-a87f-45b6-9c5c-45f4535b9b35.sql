ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS fortnox_cost_center text;

CREATE OR REPLACE FUNCTION public.ny_butik_steg(_step text, _store_id uuid, _p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.stores; v_id uuid; n int := 0; r record; t_new uuid; d date; w int; y int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Endast administratörer';
  END IF;

  IF _step = 'butik' THEN
    INSERT INTO public.stores(name, city, address, manager, legal_entity_id, country, currency, locale, region, region_country,
      slug, store_code, latitude, longitude, geocoded_at, weather_timezone, active, unit_type)
    VALUES (_p->>'name', _p->>'city', _p->>'address', _p->>'manager', _p->>'legal_entity_id', _p->>'country', _p->>'currency',
      CASE WHEN _p->>'country'='CH' THEN 'de-CH' ELSE 'sv-SE' END, NULLIF(_p->>'region',''), _p->>'country',
      _p->>'store_code', _p->>'store_code', NULLIF(_p->>'latitude','')::float8, NULLIF(_p->>'longitude','')::float8,
      CASE WHEN _p ? 'latitude' AND _p->>'latitude' <> '' THEN now() END,
      CASE WHEN _p->>'country'='CH' THEN 'Europe/Zurich' ELSE 'Europe/Stockholm' END,
      COALESCE((_p->>'active')::boolean, true), 'butik')
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('store_id', v_id);
  END IF;

  SELECT * INTO s FROM public.stores WHERE id = _store_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Butiken finns inte'; END IF;

  IF _step = 'oppettider' THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(_p->'days') AS x(weekday int, open_time time, close_time time, closed boolean) LOOP
      INSERT INTO public.store_opening_hours(store_id, weekday, open_time, close_time, closed)
      VALUES (s.id, r.weekday, CASE WHEN r.closed THEN NULL ELSE r.open_time END, CASE WHEN r.closed THEN NULL ELSE r.close_time END, COALESCE(r.closed,false))
      ON CONFLICT (store_id, weekday) DO UPDATE SET open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time, closed=EXCLUDED.closed, updated_at=now();
      n := n + 1;
    END LOOP;
    RETURN jsonb_build_object('rader', n);

  ELSIF _step = 'kassa' THEN
    INSERT INTO public.pos_registers(store_id, legal_entity_id, register_number, name)
    VALUES (s.id, s.legal_entity_id, 'MKR-POS-' || s.store_code || '-01', 'Kassa 1');
    IF s.country = 'CH' THEN
      INSERT INTO public.sumup_merchants(merchant_code, store_id, legal_entity_id, currency, label)
      VALUES (_p->>'merchant_code', s.id, s.legal_entity_id, s.currency, s.name);
    ELSE
      INSERT INTO public.nimpos_store_map(store_code, register_id, store_id)
      VALUES (_p->>'nimpos_store_code', NULLIF(_p->>'register_id',''), s.id);
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF _step = 'personalkollen' THEN
    UPDATE public.pk_costgroups SET store_id = s.id, store_id_manual = true
    WHERE id = (_p->>'costgroup_id')::uuid AND store_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'Kostnadsgruppen är redan mappad eller finns inte'; END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF _step = 'checklistor' THEN
    FOR r IN SELECT * FROM public.checklist_templates WHERE store_id = (_p->>'source_store_id')::uuid AND active LOOP
      INSERT INTO public.checklist_templates(store_id, name, description, active, sort_order, weekdays)
      VALUES (s.id, r.name, r.description, true, r.sort_order, r.weekdays) RETURNING id INTO t_new;
      INSERT INTO public.checklist_template_items(store_id, template_id, section, time_label, category, task, sort_order, active,
        work_type, specific_time, time_from, time_to, daypart, estimated_minutes, instructions, important_note, requires_photo,
        category_id, guide, requires_note, requires_value, value_label, link_url, recipe_id, std_fetch_minutes, std_prepare_minutes,
        std_do_minutes, std_check_minutes, std_restore_minutes, auto_start, standard_id, weekdays)
      SELECT s.id, t_new, section, time_label, category, task, sort_order, true,
        work_type, specific_time, time_from, time_to, daypart, estimated_minutes, instructions, important_note, requires_photo,
        category_id, guide, requires_note, requires_value, value_label, link_url, recipe_id, std_fetch_minutes, std_prepare_minutes,
        std_do_minutes, std_check_minutes, std_restore_minutes, auto_start, standard_id, weekdays
      FROM public.checklist_template_items WHERE template_id = r.id AND active;
      n := n + 1;
    END LOOP;
    RETURN jsonb_build_object('mallar', n);

  ELSIF _step = 'veckomal' THEN
    d := COALESCE(NULLIF(_p->>'from_date','')::date, current_date);
    FOR w IN 0..7 LOOP
      INSERT INTO public.store_targets(store_id, iso_year, iso_week, target_sales_ex_vat, target_staff_cost_pct, source)
      VALUES (s.id, extract(isoyear FROM d + w*7)::int, extract(week FROM d + w*7)::int,
        (_p->>'target_sales_ex_vat')::numeric, COALESCE(NULLIF(_p->>'target_staff_cost_pct','')::numeric, 20), 'manual')
      ON CONFLICT (store_id, iso_year, iso_week) DO UPDATE SET target_sales_ex_vat = EXCLUDED.target_sales_ex_vat,
        target_staff_cost_pct = EXCLUDED.target_staff_cost_pct, source = 'manual';
      n := n + 1;
    END LOOP;
    RETURN jsonb_build_object('veckor', n);

  ELSIF _step = 'hyra' THEN
    INSERT INTO public.store_fixed_costs(store_id, cost_type, amount_per_month, currency, valid_from, note)
    VALUES (s.id, 'hyra', (_p->>'amount')::numeric, s.currency, (_p->>'valid_from')::date, 'Ny butik-guiden');
    RETURN jsonb_build_object('ok', true);

  ELSIF _step = 'fortnox' THEN
    UPDATE public.stores SET fortnox_cost_center = NULLIF(trim(_p->>'cost_center'),'') WHERE id = s.id;
    RETURN jsonb_build_object('ok', true);

  ELSIF _step = 'uppgift' THEN
    INSERT INTO public.ai_uppgifter(skapad_av, tilldelad, uppgift, prioritet, underlag)
    VALUES ('Ny butik-guiden', 'Driftchef', 'Öppningsplan för ' || s.name, 2, _p->>'underlag')
    RETURNING id INTO n;
    RETURN jsonb_build_object('uppgift_id', n);
  END IF;

  RAISE EXCEPTION 'Okänt steg %', _step;
END $$;

REVOKE ALL ON FUNCTION public.ny_butik_steg(text, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ny_butik_steg(text, uuid, jsonb) TO authenticated;