-- 1) Auto-lot for ALL purchase lines, also those without a matched product.
CREATE OR REPLACE FUNCTION public.auto_trace_purchase_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_supplier_id uuid;
  v_created integer := 0;
  v_movements integer := 0;
  v_unmatched integer := 0;
  v_line record;
  v_lot_id uuid;
  v_movement_id uuid;
  v_supplier_lot text;
  v_prod public.products;
  v_fao text;
  v_method text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('auto_trace_purchase_report:' || _report_id::text));

  SELECT supplier_id INTO v_supplier_id
  FROM public.purchase_reports
  WHERE id = _report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inköpsrapporten hittades inte.';
  END IF;

  SELECT id INTO v_location_id
  FROM public.storage_locations
  WHERE active = true AND location_type = 'inkopslager'
  ORDER BY created_at
  LIMIT 1;

  -- Steg 1: skapa parti för alla rader som saknar parti (även omatchade rader).
  FOR v_line IN
    SELECT prl.*
    FROM public.purchase_report_lines prl
    WHERE prl.report_id = _report_id
      AND prl.lot_id IS NULL
      AND COALESCE(prl.quantity, 0) > 0
    ORDER BY prl.created_at, prl.id
    FOR UPDATE
  LOOP
    v_prod := NULL;
    IF v_line.product_id IS NOT NULL THEN
      SELECT * INTO v_prod FROM public.products WHERE id = v_line.product_id;
    END IF;

    v_supplier_lot := NULLIF(v_line.lot_numbers[1], '');
    v_fao := COALESCE(NULLIF(v_line.species_fao_code, ''), NULLIF(v_prod.fao_code, ''));

    IF COALESCE(NULLIF(v_line.fishing_gear, ''), NULLIF(v_line.vessel_name, '')) IS NOT NULL THEN
      v_method := 'Fangad';
    ELSIF v_prod.species_group IN ('lax','regnbage','roding','ostron-gigas','blamussla','pangasius','tilapia','abborre-odlad') THEN
      v_method := 'Odlad';
    ELSE
      v_method := 'Fangad';
    END IF;

    INSERT INTO public.lots (
      lot_number, supplier_lot_id, product_id, commercial_name, quantity_kg, unit_cost, grade,
      best_before, catch_area, catch_date_from, catch_date_to, fishing_gear,
      fishing_gear_code, vessel_name, vessel_reg, vessel_nation, presentation,
      species_fao_code, latin_name, price_status, status, traceability_required,
      supplier_id, production_method
    ) VALUES (
      public.next_internal_lot_number(), v_supplier_lot, v_line.product_id,
      COALESCE(NULLIF(v_prod.name, ''), NULLIF(v_line.product_name, '')),
      v_line.quantity, NULLIF(v_line.unit_price, 0), NULLIF(v_line.grade, ''),
      v_line.best_before, NULLIF(v_line.catch_area, ''), v_line.catch_date_from,
      v_line.catch_date_to, NULLIF(v_line.fishing_gear, ''),
      NULLIF(v_line.fishing_gear_code, ''), NULLIF(v_line.vessel_name, ''),
      NULLIF(v_line.vessel_reg, ''), NULLIF(v_line.vessel_nation, ''),
      NULLIF(v_line.presentation, ''), v_fao,
      COALESCE(NULLIF(v_line.latin_name, ''), NULLIF(v_prod.latin_name, '')),
      'preliminar', 'aktiv', true, v_supplier_id, v_method
    ) RETURNING id INTO v_lot_id;

    UPDATE public.purchase_report_lines
    SET lot_id = v_lot_id
    WHERE id = v_line.id;

    v_created := v_created + 1;
  END LOOP;

  -- Steg 2: bokför inleverans för rader som har både parti och produkt.
  IF v_location_id IS NOT NULL THEN
    FOR v_line IN
      SELECT prl.*
      FROM public.purchase_report_lines prl
      WHERE prl.report_id = _report_id
        AND prl.product_id IS NOT NULL
        AND prl.lot_id IS NOT NULL
        AND prl.movement_id IS NULL
        AND COALESCE(prl.quantity, 0) > 0
      ORDER BY prl.created_at, prl.id
      FOR UPDATE
    LOOP
      -- Partiet kan ha skapats innan produktkopplingen fanns.
      UPDATE public.lots
      SET product_id = COALESCE(product_id, v_line.product_id)
      WHERE id = v_line.lot_id;

      INSERT INTO public.stock_movements (
        product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
        reference_type, reference_id, reference_line_id, note
      ) VALUES (
        v_line.product_id, v_location_id, v_line.lot_id, 'inleverans', v_line.quantity,
        NULLIF(v_line.unit_price, 0), 'purchase_report', _report_id, v_line.id,
        'Automatisk inleverans' || CASE WHEN NULLIF(v_line.lot_numbers[1], '') IS NOT NULL
          THEN ' — leverantörsparti ' || v_line.lot_numbers[1] ELSE '' END
      ) RETURNING id INTO v_movement_id;

      UPDATE public.purchase_report_lines
      SET movement_id = v_movement_id
      WHERE id = v_line.id;

      v_movements := v_movements + 1;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_unmatched
  FROM public.purchase_report_lines
  WHERE report_id = _report_id
    AND (product_id IS NULL OR movement_id IS NULL);

  UPDATE public.purchase_reports
  SET posted_at = CASE WHEN v_unmatched = 0 THEN COALESCE(posted_at, now()) ELSE posted_at END
  WHERE id = _report_id;

  RETURN jsonb_build_object(
    'created_lots', v_created,
    'created_movements', v_movements,
    'unmatched_lines', v_unmatched,
    'location_id', v_location_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.auto_trace_purchase_report(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_trace_purchase_report(uuid) TO service_role;

-- Kör partiskapandet även när en rad läggs in utan produktkoppling.
CREATE OR REPLACE FUNCTION public.trigger_auto_trace_purchase_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_reports' THEN
    IF NEW.status = 'Klar' AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.posted_at IS NULL) THEN
      PERFORM public.auto_trace_purchase_report(NEW.id);
    END IF;
  ELSE
    IF NEW.lot_id IS NULL OR NEW.movement_id IS NULL THEN
      PERFORM public.auto_trace_purchase_report(NEW.report_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_auto_trace_purchase_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_trace_purchase_report() TO service_role;

DROP TRIGGER IF EXISTS trg_auto_trace_purchase_line ON public.purchase_report_lines;
CREATE TRIGGER trg_auto_trace_purchase_line
AFTER INSERT OR UPDATE OF product_id ON public.purchase_report_lines
FOR EACH ROW
WHEN (NEW.lot_id IS NULL OR NEW.movement_id IS NULL)
EXECUTE FUNCTION public.trigger_auto_trace_purchase_report();

-- 2) Partinummer per orderrad, för fakturatext.
CREATE OR REPLACE FUNCTION public.order_line_batches(_reference_type text, _reference_id uuid)
RETURNS TABLE (product_id uuid, batches text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.product_id,
         string_agg(DISTINCT l.lot_number, ', ' ORDER BY l.lot_number)
  FROM public.stock_movements sm
  JOIN public.lots l ON l.id = sm.lot_id
  WHERE sm.reference_type = _reference_type
    AND sm.reference_id = _reference_id
    AND sm.lot_id IS NOT NULL
  GROUP BY sm.product_id;
$$;
REVOKE ALL ON FUNCTION public.order_line_batches(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_line_batches(text, uuid) TO authenticated, service_role;

-- 3) Skriv partinummer på butiksfakturans rader.
CREATE OR REPLACE FUNCTION public.fortnox_build_shop_invoice_input(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v jsonb;
  v_entity text := 'fsab-se';
begin
  select jsonb_build_object(
    'legal_entity_code', v_entity,
    'store_id',          o.store_id,
    'customer_number',   s.fortnox_customer_number,
    'order_number',      'BUT-' || upper(left(replace(o.id::text, '-', ''), 8)),
    'invoice_date',      to_char(current_date, 'YYYY-MM-DD'),
    'due_date',          to_char(current_date + 30, 'YYYY-MM-DD'),
    'currency',          coalesce(s.currency, 'SEK'),
    'vat_included',      false,
    'our_reference',     o.packer_name,
    'your_reference',    s.name,
    'remarks',           o.notes,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',     ol.product_id,
        'article_number', coalesce(p.sku, 'MKR-' || left(replace(ol.product_id::text, '-', ''), 20)),
        'description',    coalesce(p.name, 'Vara')
                            || case when b.batches is not null then ' (Parti: ' || b.batches || ')' else '' end,
        'batches',        b.batches,
        'quantity',       ol.quantity_delivered,
        'unit',           coalesce(ol.unit, p.unit, 'kg'),
        'price',          coalesce(p.wholesale_price, 0),
        'vat_rate',       public.fortnox_vat_rate(v_entity, p.category),
        'ean',            p.barcode,
        'hs_code',        p.hs_code
      ) order by p.name)
      from public.shop_order_lines ol
      left join public.products p on p.id = ol.product_id
      left join public.order_line_batches('shop_order', o.id) b on b.product_id = ol.product_id
      where ol.shop_order_id = o.id
        and coalesce(ol.status,'') <> 'Ej tillgänglig'
        and coalesce(ol.quantity_delivered, 0) > 0
    ), '[]'::jsonb)
  )
  into v
  from public.shop_orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id;

  if v is null then raise exception 'Butiksorder % hittades inte', p_order_id; end if;
  return v;
end
$$;