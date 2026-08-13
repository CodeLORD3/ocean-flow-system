-- 1. Standardmallen som checklist_days.template_id pekar på (dagsrapporten)
INSERT INTO public.checklist_templates (id, store_id, name, description, active, sort_order)
VALUES ('00000000-0000-4000-8000-0000000000c1', NULL, 'Dagsrapport', 'Systemets standardchecklista — kan inte tas bort.', true, 0)
ON CONFLICT (id) DO UPDATE SET active = true, name = EXCLUDED.name;

-- 2. Spärr: mallar med registrerade checklistdagar kan inte raderas
CREATE OR REPLACE FUNCTION public.block_template_delete_with_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF OLD.id = '00000000-0000-4000-8000-0000000000c1'::uuid THEN
    RAISE EXCEPTION 'Systemets standardchecklista kan inte tas bort.';
  END IF;
  SELECT count(*) INTO n FROM public.checklist_days WHERE template_id = OLD.id;
  IF n > 0 THEN
    RAISE EXCEPTION 'Mallen har % registrerade checklistdagar och kan inte tas bort. Inaktivera den i stället.', n;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_template_delete_with_days ON public.checklist_templates;
CREATE TRIGGER trg_block_template_delete_with_days
BEFORE DELETE ON public.checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.block_template_delete_with_days();

-- 3. Dagliga jobbkörningar: en gång per dygn
CREATE TABLE IF NOT EXISTS public.job_runs (
  job_name text NOT NULL,
  run_date date NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  PRIMARY KEY (job_name, run_date)
);
GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff kan läsa jobbkörningar" ON public.job_runs
FOR SELECT TO authenticated USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.zero_stale_day_prices_midnight()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now timestamp;
  n integer;
BEGIN
  local_now := now() AT TIME ZONE 'Europe/Stockholm';
  -- Körs varje timme men gör bara jobbet vid svensk lokal midnatt, en gång per dygn.
  IF EXTRACT(HOUR FROM local_now) <> 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.job_runs (job_name, run_date)
  VALUES ('zero_stale_day_prices', local_now::date)
  ON CONFLICT (job_name, run_date) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  n := public.zero_stale_day_prices();

  UPDATE public.job_runs
     SET result = jsonb_build_object('zeroed', n)
   WHERE job_name = 'zero_stale_day_prices' AND run_date = local_now::date;

  RETURN n;
END;
$$;

-- 4. Inleverans skriver spårbarhet på partiet
CREATE OR REPLACE FUNCTION public.post_purchase_report(p_report_id uuid, p_location_id uuid, p_lots jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lot jsonb;
  v_lot_id uuid;
  v_movement_id uuid;
  v_lot_ids uuid[] := '{}';
  v_posted timestamptz;
  v_line_ids uuid[];
  v_supplier uuid;
  v_prod public.products;
  v_fao text;
  v_method text;
BEGIN
  SELECT posted_at, supplier_id INTO v_posted, v_supplier
  FROM public.purchase_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inköpsrapporten hittades inte.';
  END IF;
  IF v_posted IS NOT NULL THEN
    RAISE EXCEPTION 'Rapporten är redan bokförd och kan inte bokföras igen.';
  END IF;
  IF p_lots IS NULL OR jsonb_array_length(p_lots) = 0 THEN
    RAISE EXCEPTION 'Inga partier att bokföra.';
  END IF;

  FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots) LOOP
    IF (v_lot->>'product_id') IS NULL THEN
      RAISE EXCEPTION 'En rad saknar kopplad produkt och kan inte bokföras.';
    END IF;
    IF COALESCE((v_lot->>'quantity_kg')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Kvantiteten måste vara större än noll för alla partier.';
    END IF;

    SELECT * INTO v_prod FROM public.products WHERE id = (v_lot->>'product_id')::uuid;

    -- FAO-kod: radens egen kod, annars produktens, annars vanligaste koden i artgruppen.
    v_fao := NULLIF(v_lot->>'fao_code', '');
    IF v_fao IS NULL THEN v_fao := NULLIF(v_prod.fao_code, ''); END IF;
    IF v_fao IS NULL AND COALESCE(v_prod.species_group, '') <> '' THEN
      SELECT p.fao_code INTO v_fao
        FROM public.products p
       WHERE p.species_group = v_prod.species_group AND COALESCE(p.fao_code, '') <> ''
       GROUP BY p.fao_code
       ORDER BY count(*) DESC
       LIMIT 1;
    END IF;

    -- Produktionsmetod: redskap eller fartyg betyder vildfångat, odlade arter annars odlat.
    IF COALESCE(NULLIF(v_lot->>'fishing_gear', ''), NULLIF(v_lot->>'vessel_name', '')) IS NOT NULL THEN
      v_method := 'Fangad';
    ELSIF v_prod.species_group IN ('lax','regnbage','roding','ostron-gigas','blamussla','pangasius','tilapia','abborre-odlad') THEN
      v_method := 'Odlad';
    ELSE
      v_method := 'Fangad';
    END IF;

    INSERT INTO public.lots (
      lot_number, supplier_lot_id, product_id, quantity_kg, unit_cost, grade,
      best_before, catch_area, catch_date_from, fishing_gear, vessel_name,
      presentation, species_fao_code, latin_name, price_status, status, traceability_required,
      supplier_id, production_method
    ) VALUES (
      public.next_internal_lot_number(),
      NULLIF(v_lot->>'supplier_lot_number', ''),
      (v_lot->>'product_id')::uuid,
      (v_lot->>'quantity_kg')::numeric,
      NULLIF(v_lot->>'unit_cost', '')::numeric,
      NULLIF(v_lot->>'grade', ''),
      NULLIF(v_lot->>'best_before', '')::date,
      NULLIF(v_lot->>'catch_area', ''),
      NULLIF(v_lot->>'catch_date_from', '')::date,
      NULLIF(v_lot->>'fishing_gear', ''),
      NULLIF(v_lot->>'vessel_name', ''),
      NULLIF(v_lot->>'presentation', ''),
      v_fao,
      COALESCE(NULLIF(v_lot->>'latin_name', ''), NULLIF(v_prod.latin_name, '')),
      'preliminar', 'aktiv', true,
      v_supplier,
      v_method
    ) RETURNING id INTO v_lot_id;

    INSERT INTO public.stock_movements (
      product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
      reference_type, reference_id, note
    ) VALUES (
      (v_lot->>'product_id')::uuid,
      p_location_id,
      v_lot_id,
      'inleverans',
      (v_lot->>'quantity_kg')::numeric,
      NULLIF(v_lot->>'unit_cost', '')::numeric,
      'purchase_report',
      p_report_id,
      'Följesedel — parti ' || COALESCE(NULLIF(v_lot->>'supplier_lot_number', ''), 'utan leverantörsparti')
    ) RETURNING id INTO v_movement_id;

    SELECT array_agg(x::uuid) INTO v_line_ids
    FROM jsonb_array_elements_text(COALESCE(v_lot->'line_ids', '[]'::jsonb)) AS x;

    IF v_line_ids IS NOT NULL THEN
      UPDATE public.purchase_report_lines
      SET lot_id = v_lot_id,
          movement_id = v_movement_id,
          parent_line_id = CASE
            WHEN id = NULLIF(v_lot->>'parent_line_id', '')::uuid THEN NULL
            ELSE NULLIF(v_lot->>'parent_line_id', '')::uuid
          END
      WHERE id = ANY(v_line_ids);
    END IF;

    v_lot_ids := v_lot_ids || v_lot_id;
  END LOOP;

  UPDATE public.purchase_reports
  SET posted_at = now()
  WHERE id = p_report_id;

  RETURN v_lot_ids;
END;
$function$;

-- 5. Avbokning av följesedel: idempotent, motbokar där partiet ligger, spärrar flyttat/förbrukat
CREATE OR REPLACE FUNCTION public.unpost_purchase_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted timestamptz;
  rec record;
  v_blocked jsonb := '[]'::jsonb;
  v_reversed integer := 0;
  v_qty numeric;
BEGIN
  IF NOT (public.is_staff() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  -- Dubbelklick kan aldrig ge dubbel motbokning: låset och posted_at-kontrollen gör körningen idempotent.
  PERFORM pg_advisory_xact_lock(hashtext('unpost_purchase_report:' || _report_id::text));

  SELECT posted_at INTO v_posted FROM public.purchase_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inköpsrapporten hittades inte.';
  END IF;
  IF v_posted IS NULL THEN
    RETURN jsonb_build_object('status', 'already_unposted', 'reversed_lots', 0);
  END IF;

  -- Steg 1: partier som lämnat inleveransplatsen eller förbrukats spärrar avbokningen.
  FOR rec IN
    SELECT l.id AS lot_id, l.lot_number, p.name AS product_name,
           COALESCE(SUM(CASE WHEN m.movement_type = 'inleverans' THEN m.quantity_kg ELSE 0 END), 0) AS received,
           COALESCE(SUM(m.quantity_kg), 0) AS remaining
      FROM public.lots l
      JOIN public.products p ON p.id = l.product_id
      JOIN public.purchase_report_lines prl ON prl.lot_id = l.id AND prl.report_id = _report_id
      LEFT JOIN public.stock_movements m ON m.lot_id = l.id
     GROUP BY l.id, l.lot_number, p.name
  LOOP
    IF ROUND(rec.remaining, 3) < ROUND(rec.received, 3) THEN
      v_blocked := v_blocked || jsonb_build_object(
        'lot_id', rec.lot_id,
        'lot_number', rec.lot_number,
        'product', rec.product_name,
        'received_kg', rec.received,
        'remaining_kg', rec.remaining,
        'events', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'movement_type', m2.movement_type,
                   'quantity_kg', m2.quantity_kg,
                   'location', sl.name,
                   'note', m2.note,
                   'created_at', m2.created_at) ORDER BY m2.created_at)
            FROM public.stock_movements m2
            JOIN public.storage_locations sl ON sl.id = m2.location_id
           WHERE m2.lot_id = rec.lot_id AND m2.movement_type <> 'inleverans'
        ), '[]'::jsonb)
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_blocked) > 0 THEN
    RETURN jsonb_build_object('status', 'blocked', 'blocked_lots', v_blocked);
  END IF;

  -- Steg 2: motbokar exakt det som ligger kvar, på den plats där det ligger.
  FOR rec IN
    SELECT m.product_id, m.location_id, m.lot_id, ROUND(SUM(m.quantity_kg), 3) AS qty
      FROM public.stock_movements m
      JOIN public.purchase_report_lines prl ON prl.lot_id = m.lot_id AND prl.report_id = _report_id
     GROUP BY m.product_id, m.location_id, m.lot_id
    HAVING ROUND(SUM(m.quantity_kg), 3) > 0
  LOOP
    INSERT INTO public.stock_movements (
      product_id, location_id, lot_id, movement_type, quantity_kg,
      reference_type, reference_id, note
    ) VALUES (
      rec.product_id, rec.location_id, rec.lot_id, 'justering', -rec.qty,
      'purchase_report', _report_id, 'Följesedel avbokad — inleverans återförd'
    );
    v_reversed := v_reversed + 1;
  END LOOP;

  UPDATE public.lots l
     SET status = 'terminerad', terminated_reason = 'Följesedel avbokad', updated_at = now()
   WHERE l.id IN (SELECT lot_id FROM public.purchase_report_lines WHERE report_id = _report_id AND lot_id IS NOT NULL);

  UPDATE public.purchase_report_lines
     SET lot_id = NULL, movement_id = NULL, parent_line_id = NULL
   WHERE report_id = _report_id;

  UPDATE public.purchase_reports SET posted_at = NULL WHERE id = _report_id;

  RETURN jsonb_build_object('status', 'unposted', 'reversed_lots', v_reversed);
END;
$$;

-- 6. Butikens mottagning: koppla mottagningen till partiet som följde med leveransen
CREATE OR REPLACE FUNCTION public.receiving_link_lot(
  _order_id uuid,
  _product_id uuid,
  _location_id uuid,
  _best_before date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lots uuid[];
  v_qty numeric;
  v_lot_id uuid;
  v_linked integer;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  -- Partiet följer med leveransen: finns lot_id på rörelserna används det, aldrig ett nytt "okänt" parti.
  SELECT array_agg(DISTINCT m.lot_id) INTO v_lots
    FROM public.stock_movements m
   WHERE m.reference_type = 'shop_order'
     AND m.reference_id = _order_id::text
     AND m.product_id = _product_id
     AND m.lot_id IS NOT NULL;

  IF v_lots IS NOT NULL AND array_length(v_lots, 1) > 0 THEN
    IF _best_before IS NOT NULL THEN
      UPDATE public.lots SET best_before = _best_before, updated_at = now()
       WHERE id = ANY(v_lots);
    END IF;
    RETURN jsonb_build_object('status', 'linked', 'lots', array_length(v_lots, 1), 'created', false);
  END IF;

  -- Inget parti alls i kedjan: skapa ett spårbart parti och koppla rörelserna till det,
  -- så att partiet aldrig blir en lös post utan saldo.
  SELECT ROUND(SUM(m.quantity_kg), 3) INTO v_qty
    FROM public.stock_movements m
   WHERE m.reference_type = 'shop_order'
     AND m.reference_id = _order_id::text
     AND m.product_id = _product_id
     AND m.location_id = _location_id
     AND m.lot_id IS NULL;

  IF v_qty IS NULL THEN
    RETURN jsonb_build_object('status', 'no_movements', 'created', false);
  END IF;

  INSERT INTO public.lots (lot_number, product_id, quantity_kg, best_before, status,
                           traceability_required, catch_area)
  VALUES (public.next_internal_lot_number(), _product_id, GREATEST(v_qty, 0), _best_before, 'aktiv',
          true, 'Okänd härkomst — parti saknades i leveranskedjan')
  RETURNING id INTO v_lot_id;

  UPDATE public.stock_movements m
     SET lot_id = v_lot_id
   WHERE m.reference_type = 'shop_order'
     AND m.reference_id = _order_id::text
     AND m.product_id = _product_id
     AND m.lot_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RETURN jsonb_build_object('status', 'created', 'lot_id', v_lot_id, 'movements_linked', v_linked, 'created', true);
END;
$$;