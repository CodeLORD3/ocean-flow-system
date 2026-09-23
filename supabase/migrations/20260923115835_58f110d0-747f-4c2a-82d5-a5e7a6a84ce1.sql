-- ============ DEL A: MOMS ============
CREATE TABLE IF NOT EXISTS public.pos_vat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  rate numeric(5,2) NOT NULL,
  category text NOT NULL CHECK (category IN ('food','standard','zero','reduced')),
  valid_from date NOT NULL,
  valid_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_vat_rates_uk ON public.pos_vat_rates (country_code, category, valid_from);
GRANT SELECT ON public.pos_vat_rates TO authenticated;
GRANT ALL ON public.pos_vat_rates TO service_role;
ALTER TABLE public.pos_vat_rates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_vat_rates' AND policyname='Personal ser momssatser') THEN
    CREATE POLICY "Personal ser momssatser" ON public.pos_vat_rates FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

INSERT INTO public.pos_vat_rates (country_code, rate, category, valid_from, valid_to, note) VALUES
  ('SE', 12.00, 'food',     '2000-01-01', '2026-03-31', 'ordinarie livsmedelsmoms'),
  ('SE',  6.00, 'food',     '2026-04-01', NULL,         'tillfälligt sänkt livsmedelsmoms'),
  ('SE', 25.00, 'standard', '2000-01-01', NULL,         NULL),
  ('SE',  0.00, 'zero',     '2000-01-01', NULL,         NULL),
  ('CH',  2.60, 'food',     '2024-01-01', NULL,         NULL),
  ('CH',  8.10, 'standard', '2024-01-01', NULL,         NULL)
ON CONFLICT (country_code, category, valid_from) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pos_vat_rate_for(p_country char(2), p_category text, p_at date DEFAULT current_date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.rate
  FROM public.pos_vat_rates v
  WHERE v.country_code = p_country
    AND v.category = coalesce(p_category, 'food')
    AND v.valid_from <= p_at
    AND (v.valid_to IS NULL OR v.valid_to >= p_at)
  ORDER BY v.valid_from DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.pos_vat_rate_for(char(2), text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_vat_rate_for(char(2), text, date) TO authenticated, service_role;

-- ============ DEL B: PRISLISTOR OCH OVERRIDES ============
CREATE TABLE IF NOT EXISTS public.pos_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  country_code char(2) NOT NULL,
  currency_code char(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_price_lists TO authenticated;
GRANT ALL ON public.pos_price_lists TO service_role;
ALTER TABLE public.pos_price_lists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_price_lists' AND policyname='Personal ser prislistor') THEN
    CREATE POLICY "Personal ser prislistor" ON public.pos_price_lists FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

INSERT INTO public.pos_price_lists (name, country_code, currency_code) VALUES
  ('Sverige butikspris', 'SE', 'SEK'),
  ('Zollikon butikspris', 'CH', 'CHF')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pos_price_list_items (
  price_list_id uuid NOT NULL REFERENCES public.pos_price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_inc_vat numeric(12,2) NOT NULL,
  vat_category text NOT NULL DEFAULT 'food',
  valid_from timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (price_list_id, product_id, valid_from)
);
CREATE INDEX IF NOT EXISTS pos_price_list_items_lookup ON public.pos_price_list_items (price_list_id, product_id, valid_from DESC);
GRANT SELECT ON public.pos_price_list_items TO authenticated;
GRANT ALL ON public.pos_price_list_items TO service_role;
ALTER TABLE public.pos_price_list_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_price_list_items' AND policyname='Personal ser prisrader') THEN
    CREATE POLICY "Personal ser prisrader" ON public.pos_price_list_items FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pos_store_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_inc_vat numeric(12,2) NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('local_catch','clearance','competition','campaign')),
  lot_number text,
  percent_off numeric(5,2),
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_override_window CHECK (valid_to > valid_from AND valid_to <= valid_from + interval '7 days')
);
CREATE INDEX IF NOT EXISTS pos_store_price_overrides_lookup
  ON public.pos_store_price_overrides (store_id, product_id, valid_from DESC);
GRANT SELECT ON public.pos_store_price_overrides TO authenticated;
GRANT ALL ON public.pos_store_price_overrides TO service_role;
ALTER TABLE public.pos_store_price_overrides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_store_price_overrides' AND policyname='Personal ser overrides for sina butiker') THEN
    CREATE POLICY "Personal ser overrides for sina butiker" ON public.pos_store_price_overrides
      FOR SELECT TO authenticated USING (public.is_staff() AND public.can_see_store(store_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pos_effective_price(p_store_id uuid, p_product_id uuid, p_at timestamptz DEFAULT now())
RETURNS TABLE(price_inc_vat numeric, vat_rate numeric, price_source text, source_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country char(2);
  v_row record;
BEGIN
  SELECT s.region_country INTO v_country FROM public.stores s WHERE s.id = p_store_id;

  SELECT o.id, o.price_inc_vat INTO v_row
  FROM public.pos_store_price_overrides o
  WHERE o.store_id = p_store_id
    AND o.product_id = p_product_id
    AND o.valid_from <= p_at
    AND o.valid_to > p_at
  ORDER BY o.valid_from DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.price_inc_vat,
      public.pos_vat_rate_for(v_country, 'food', p_at::date),
      'store_override'::text, v_row.id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT i.price_inc_vat,
         public.pos_vat_rate_for(v_country, i.vat_category, p_at::date),
         'list'::text,
         i.price_list_id
  FROM public.pos_price_list_items i
  JOIN public.pos_price_lists l ON l.id = i.price_list_id
  WHERE l.country_code = v_country
    AND l.is_active
    AND i.product_id = p_product_id
    AND i.valid_from <= p_at
  ORDER BY i.valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::numeric, public.pos_vat_rate_for(v_country, 'food', p_at::date), 'none'::text, NULL::uuid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pos_effective_price(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_effective_price(uuid, uuid, timestamptz) TO authenticated, service_role;

-- Publicera priser. Journalförs som price_changed på varje aktivt register i landets butiker.
CREATE OR REPLACE FUNCTION public.pos_publish_prices(p_price_list_id uuid, p_items jsonb, p_staff uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country char(2);
  v_now timestamptz := now();
  v_count int := 0;
  v_regs int := 0;
  v_list_name text;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör kan publicera priser.';
  END IF;

  SELECT l.country_code, l.name INTO v_country, v_list_name FROM public.pos_price_lists l WHERE l.id = p_price_list_id;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Prislistan finns inte.';
  END IF;

  FOR r IN
    SELECT (e->>'product_id')::uuid AS product_id,
           round((e->>'price_inc_vat')::numeric, 2) AS price,
           coalesce(e->>'vat_category', 'food') AS vat_category
    FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  LOOP
    CONTINUE WHEN r.product_id IS NULL OR r.price IS NULL;
    INSERT INTO public.pos_price_list_items (price_list_id, product_id, price_inc_vat, vat_category, valid_from, published_by, published_at)
    VALUES (p_price_list_id, r.product_id, r.price, r.vat_category, v_now, p_staff, v_now)
    ON CONFLICT (price_list_id, product_id, valid_from) DO UPDATE
      SET price_inc_vat = excluded.price_inc_vat, vat_category = excluded.vat_category;
    v_count := v_count + 1;
  END LOOP;

  FOR r IN
    SELECT g.id FROM public.pos_registers g
    JOIN public.stores s ON s.id = g.store_id
    WHERE g.is_active AND s.region_country = v_country AND coalesce(s.pos_enabled, false)
  LOOP
    PERFORM public.pos_journal_append(
      r.id, 'price_changed',
      jsonb_build_object('source', 'price_list', 'price_list', v_list_name, 'price_list_id', p_price_list_id, 'items', v_count),
      p_staff);
    v_regs := v_regs + 1;
  END LOOP;

  RETURN jsonb_build_object('items', v_count, 'registers', v_regs, 'valid_from', v_now);
END $$;
REVOKE ALL ON FUNCTION public.pos_publish_prices(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_publish_prices(uuid, jsonb, uuid) TO authenticated, service_role;

-- Skapa en override manuellt (max sju dagar) och journalför den.
CREATE OR REPLACE FUNCTION public.pos_create_override(
  p_store_id uuid, p_product_id uuid, p_price numeric, p_reason text,
  p_valid_to timestamptz, p_staff uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör kan sätta butikspris.';
  END IF;

  SELECT name INTO v_name FROM public.products WHERE id = p_product_id;

  INSERT INTO public.pos_store_price_overrides
    (store_id, product_id, price_inc_vat, valid_from, valid_to, reason, created_by, approved_by)
  VALUES (p_store_id, p_product_id, round(p_price, 2), now(), p_valid_to, p_reason, p_staff, p_staff)
  RETURNING id INTO v_id;

  FOR r IN SELECT id FROM public.pos_registers WHERE store_id = p_store_id AND is_active LOOP
    PERFORM public.pos_journal_append(
      r.id, 'price_changed',
      jsonb_build_object('source', 'store_override', 'action', 'created', 'override_id', v_id,
                         'product', v_name, 'product_id', p_product_id,
                         'price_inc_vat', round(p_price, 2), 'reason', p_reason, 'valid_to', p_valid_to),
      p_staff);
  END LOOP;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_create_override(uuid, uuid, numeric, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_override(uuid, uuid, numeric, text, timestamptz, uuid) TO authenticated, service_role;

-- Avsluta en override i förtid.
CREATE OR REPLACE FUNCTION public.pos_end_override(p_override_id uuid, p_staff uuid DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ov record;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör kan avsluta butikspris.';
  END IF;

  UPDATE public.pos_store_price_overrides
     SET valid_to = greatest(v_now, valid_from + interval '1 second')
   WHERE id = p_override_id
  RETURNING * INTO v_ov;

  IF v_ov.id IS NULL THEN
    RAISE EXCEPTION 'Butikspriset finns inte.';
  END IF;

  FOR r IN SELECT id FROM public.pos_registers WHERE store_id = v_ov.store_id AND is_active LOOP
    PERFORM public.pos_journal_append(
      r.id, 'price_changed',
      jsonb_build_object('source', 'store_override', 'action', 'ended_early', 'override_id', p_override_id,
                         'product_id', v_ov.product_id, 'reason', v_ov.reason, 'valid_to', v_ov.valid_to),
      p_staff);
  END LOOP;

  RETURN v_ov.valid_to;
END $$;
REVOKE ALL ON FUNCTION public.pos_end_override(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_end_override(uuid, uuid) TO authenticated, service_role;

-- ============ DEL C: NEDSÄTTNING NÄRA BÄST FÖRE ============
CREATE TABLE IF NOT EXISTS public.pos_markdown_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  percent_off numeric(5,2) NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('last_day','hours_to_expiry')),
  hours_before int,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_markdown_rules TO authenticated;
GRANT ALL ON public.pos_markdown_rules TO service_role;
ALTER TABLE public.pos_markdown_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_markdown_rules' AND policyname='Personal ser nedsattningsregler') THEN
    CREATE POLICY "Personal ser nedsattningsregler" ON public.pos_markdown_rules FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

INSERT INTO public.pos_markdown_rules (country_code, category_id, percent_off, trigger_type, hours_before, active)
SELECT 'SE', NULL, 25.00, 'last_day', NULL, false
WHERE NOT EXISTS (SELECT 1 FROM public.pos_markdown_rules WHERE country_code='SE' AND trigger_type='last_day');
INSERT INTO public.pos_markdown_rules (country_code, category_id, percent_off, trigger_type, hours_before, active)
SELECT 'SE', NULL, 50.00, 'hours_to_expiry', 4, false
WHERE NOT EXISTS (SELECT 1 FROM public.pos_markdown_rules WHERE country_code='SE' AND trigger_type='hours_to_expiry');

CREATE OR REPLACE FUNCTION public.pos_set_markdown_rule_active(p_rule_id uuid, p_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör kan ändra nedsättningsregler.';
  END IF;
  UPDATE public.pos_markdown_rules SET active = p_active WHERE id = p_rule_id;
  RETURN p_active;
END $$;
REVOKE ALL ON FUNCTION public.pos_set_markdown_rule_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_set_markdown_rule_active(uuid, boolean) TO authenticated, service_role;

/*
 * Nedsättning nära bäst före.
 * Partiets butik hämtas ur lagerrörelserna: senaste butikslagret partiet rört sig till.
 * Inga saldon eller lagerrörelser skapas: bara tidsbegränsade butikspriser plus journalpost.
 */
CREATE OR REPLACE FUNCTION public.pos_apply_markdowns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_now timestamptz := now();
  r record;
  v_base numeric;
  v_id uuid;
  g record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pos_markdown_rules WHERE active) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT DISTINCT ON (l.id, st.id)
           l.id AS lot_id, l.lot_number, l.best_before, l.product_id,
           st.id AS store_id, st.region_country,
           mr.id AS rule_id, mr.percent_off, mr.trigger_type
    FROM public.lots l
    JOIN public.stock_movements sm ON sm.lot_id = l.id
    JOIN public.storage_locations sloc ON sloc.id = sm.location_id
    JOIN public.stores st ON st.id = sloc.store_id AND coalesce(st.pos_enabled, false)
    JOIN public.pos_markdown_rules mr
      ON mr.active
     AND mr.country_code = st.region_country
     AND (mr.category_id IS NULL OR mr.category_id = (SELECT c.id FROM public.categories c
                                                        JOIN public.products p ON p.category = c.name
                                                       WHERE p.id = l.product_id LIMIT 1))
    WHERE l.product_id IS NOT NULL
      AND coalesce(l.quantity_kg, 0) > 0
      AND l.best_before IS NOT NULL
      AND (
        (mr.trigger_type = 'last_day' AND l.best_before = current_date)
        OR (mr.trigger_type = 'hours_to_expiry' AND mr.hours_before IS NOT NULL
            AND (l.best_before + interval '1 day') - v_now <= make_interval(hours => mr.hours_before)
            AND (l.best_before + interval '1 day') > v_now)
      )
    ORDER BY l.id, st.id, mr.percent_off DESC
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.pos_store_price_overrides o
      WHERE o.store_id = r.store_id AND o.product_id = r.product_id
        AND o.reason = 'clearance' AND o.valid_from <= v_now AND o.valid_to > v_now
    ) THEN
      CONTINUE;
    END IF;

    SELECT price_inc_vat INTO v_base FROM public.pos_effective_price(r.store_id, r.product_id, v_now);
    CONTINUE WHEN v_base IS NULL OR v_base <= 0;

    INSERT INTO public.pos_store_price_overrides
      (store_id, product_id, price_inc_vat, valid_from, valid_to, reason, lot_number, percent_off)
    VALUES (r.store_id, r.product_id,
            round(v_base * (100 - r.percent_off) / 100, 2),
            v_now,
            least((r.best_before + interval '1 day') - interval '1 second', v_now + interval '7 days'),
            'clearance', r.lot_number, r.percent_off)
    RETURNING id INTO v_id;

    v_created := v_created + 1;

    FOR g IN SELECT id FROM public.pos_registers WHERE store_id = r.store_id AND is_active LOOP
      PERFORM public.pos_journal_append(
        g.id, 'price_changed',
        jsonb_build_object('source', 'markdown', 'override_id', v_id, 'lot_number', r.lot_number,
                           'percent_off', r.percent_off, 'product_id', r.product_id,
                           'best_before', r.best_before, 'price_inc_vat', round(v_base * (100 - r.percent_off) / 100, 2)));
    END LOOP;
  END LOOP;

  RETURN v_created;
END $$;
REVOKE ALL ON FUNCTION public.pos_apply_markdowns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_apply_markdowns() TO authenticated, service_role;