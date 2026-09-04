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

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Aktivt inköpslager saknas.';
  END IF;

  FOR v_line IN
    SELECT prl.*
    FROM public.purchase_report_lines prl
    WHERE prl.report_id = _report_id
      AND prl.product_id IS NOT NULL
      AND prl.lot_id IS NULL
      AND COALESCE(prl.quantity, 0) > 0
    ORDER BY prl.created_at, prl.id
    FOR UPDATE
  LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = v_line.product_id;
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
      lot_number, supplier_lot_id, product_id, quantity_kg, unit_cost, grade,
      best_before, catch_area, catch_date_from, catch_date_to, fishing_gear,
      fishing_gear_code, vessel_name, vessel_reg, vessel_nation, presentation,
      species_fao_code, latin_name, price_status, status, traceability_required,
      supplier_id, production_method
    ) VALUES (
      public.next_internal_lot_number(), v_supplier_lot, v_line.product_id,
      v_line.quantity, NULLIF(v_line.unit_price, 0), NULLIF(v_line.grade, ''),
      v_line.best_before, NULLIF(v_line.catch_area, ''), v_line.catch_date_from,
      v_line.catch_date_to, NULLIF(v_line.fishing_gear, ''),
      NULLIF(v_line.fishing_gear_code, ''), NULLIF(v_line.vessel_name, ''),
      NULLIF(v_line.vessel_reg, ''), NULLIF(v_line.vessel_nation, ''),
      NULLIF(v_line.presentation, ''), v_fao,
      COALESCE(NULLIF(v_line.latin_name, ''), NULLIF(v_prod.latin_name, '')),
      'preliminar', 'aktiv', true, v_supplier_id, v_method
    ) RETURNING id INTO v_lot_id;

    INSERT INTO public.stock_movements (
      product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
      reference_type, reference_id, reference_line_id, note
    ) VALUES (
      v_line.product_id, v_location_id, v_lot_id, 'inleverans', v_line.quantity,
      NULLIF(v_line.unit_price, 0), 'purchase_report', _report_id, v_line.id,
      'Automatisk inleverans' || CASE WHEN v_supplier_lot IS NOT NULL THEN ' — leverantörsparti ' || v_supplier_lot ELSE '' END
    ) RETURNING id INTO v_movement_id;

    UPDATE public.purchase_report_lines
    SET lot_id = v_lot_id, movement_id = v_movement_id
    WHERE id = v_line.id;

    v_created := v_created + 1;
  END LOOP;

  SELECT count(*) INTO v_unmatched
  FROM public.purchase_report_lines
  WHERE report_id = _report_id
    AND (product_id IS NULL OR lot_id IS NULL);

  IF v_created > 0 OR NOT EXISTS (
    SELECT 1 FROM public.purchase_report_lines WHERE report_id = _report_id
  ) THEN
    UPDATE public.purchase_reports
    SET posted_at = CASE WHEN v_unmatched = 0 THEN COALESCE(posted_at, now()) ELSE posted_at END
    WHERE id = _report_id;
  END IF;

  RETURN jsonb_build_object('created_lots', v_created, 'unmatched_lines', v_unmatched, 'location_id', v_location_id);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_trace_purchase_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_trace_purchase_report(uuid) TO authenticated, service_role;

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
    IF NEW.product_id IS NOT NULL AND NEW.lot_id IS NULL THEN
      PERFORM public.auto_trace_purchase_report(NEW.report_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_auto_trace_purchase_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_trace_purchase_report() TO service_role;

DROP TRIGGER IF EXISTS trg_auto_trace_purchase_report ON public.purchase_reports;
CREATE TRIGGER trg_auto_trace_purchase_report
AFTER UPDATE OF status ON public.purchase_reports
FOR EACH ROW
WHEN (NEW.status = 'Klar')
EXECUTE FUNCTION public.trigger_auto_trace_purchase_report();

DROP TRIGGER IF EXISTS trg_auto_trace_purchase_line ON public.purchase_report_lines;
CREATE TRIGGER trg_auto_trace_purchase_line
AFTER INSERT OR UPDATE OF product_id ON public.purchase_report_lines
FOR EACH ROW
WHEN (NEW.product_id IS NOT NULL AND NEW.lot_id IS NULL)
EXECUTE FUNCTION public.trigger_auto_trace_purchase_report();

CREATE OR REPLACE FUNCTION public.trace_lot_to_invoices(_lot_id uuid)
RETURNS TABLE (
  lot_id uuid,
  lot_number text,
  supplier_lot_id text,
  product_name text,
  purchase_report_id uuid,
  purchase_date date,
  supplier_name text,
  vessel_name text,
  catch_area text,
  movement_id uuid,
  movement_type text,
  movement_at timestamptz,
  order_id uuid,
  order_number text,
  fortnox_document_number text,
  invoice_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.lot_number, l.supplier_lot_id, p.name,
         pr.id, COALESCE(pr.document_date, prl.purchase_date),
         COALESCE(pr.supplier_name_raw, prl.supplier_name), l.vessel_name, l.catch_area,
         sm.id, sm.movement_type, sm.created_at,
         CASE WHEN sm.reference_type = 'shop_order' THEN sm.reference_id ELSE NULL END,
         CASE WHEN so.id IS NOT NULL THEN 'BUT-' || upper(left(replace(so.id::text, '-', ''), 8)) ELSE NULL END,
         fij.fortnox_document_number,
         fij.status
  FROM public.lots l
  JOIN public.products p ON p.id = l.product_id
  LEFT JOIN public.purchase_report_lines prl ON prl.lot_id = l.id
  LEFT JOIN public.purchase_reports pr ON pr.id = prl.report_id
  LEFT JOIN public.stock_movements sm ON sm.lot_id = l.id
  LEFT JOIN public.shop_orders so
    ON sm.reference_type = 'shop_order' AND so.id = sm.reference_id
  LEFT JOIN public.fortnox_invoice_jobs fij
    ON fij.order_id = so.id AND fij.order_kind = 'shop_order'
  WHERE l.id = _lot_id
  ORDER BY sm.created_at, sm.id;
$$;
REVOKE ALL ON FUNCTION public.trace_lot_to_invoices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trace_lot_to_invoices(uuid) TO authenticated, service_role;