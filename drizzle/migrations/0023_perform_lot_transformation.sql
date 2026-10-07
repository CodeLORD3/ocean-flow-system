CREATE OR REPLACE FUNCTION public.perform_lot_transformation(
  _store_id uuid, _location_id uuid,
  _source_product_id uuid, _source_lot_id uuid, _source_quantity numeric, _source_unit_cost numeric,
  _target_product_id uuid, _target_quantity numeric, _target_packages numeric, _target_best_before date,
  _kind text, _waste_quantity numeric, _waste_reason text,
  _performed_at timestamptz, _performed_by_name text, _note text, _label text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _amount numeric := round(abs(coalesce(_source_quantity,0)),3);
  _output numeric := round(abs(coalesce(_target_quantity,0)),3);
  _waste  numeric := round(abs(coalesce(_waste_quantity,0)),3);
  _cost numeric := nullif(coalesce(_source_unit_cost,0),0);
  _tcost numeric;
  _avail numeric;
  _src lots%ROWTYPE;
  _staff uuid;
  _lot_id uuid;
  _lot_number text;
  _yield numeric;
  _hist uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inte inloggad'; END IF;
  IF _location_id IS NULL THEN RAISE EXCEPTION 'Välj lagerplats.'; END IF;
  IF _source_product_id IS NULL OR _target_product_id IS NULL THEN RAISE EXCEPTION 'Välj källprodukt och målprodukt.'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Ange mängd att omvandla.'; END IF;
  IF _output <= 0 THEN RAISE EXCEPTION 'Ange hur mycket som skapas.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_source_product_id::text || _location_id::text));

  SELECT coalesce(sum(quantity_kg),0) INTO _avail FROM stock_movements
   WHERE product_id = _source_product_id AND location_id = _location_id
     AND (_source_lot_id IS NULL OR lot_id = _source_lot_id);
  IF _avail + 0.001 < _amount + _waste THEN
    RAISE EXCEPTION 'Otillräckligt saldo: % tillgängligt, % behövs.', round(_avail,3), _amount + _waste;
  END IF;

  SELECT id INTO _staff FROM staff WHERE user_id = auth.uid() LIMIT 1;
  _tcost := CASE WHEN _cost IS NULL THEN NULL ELSE round(((_amount + _waste) * _cost) / _output, 3) END;

  INSERT INTO stock_movements(product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, note, created_by)
  VALUES (_source_product_id, _location_id, _source_lot_id, 'tillverkning_ut', -_amount, _cost, 'omvandling', _label, _staff);

  IF _waste > 0 THEN
    INSERT INTO stock_movements(product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, note, created_by)
    VALUES (_source_product_id, _location_id, _source_lot_id, 'svinn', -_waste, _cost, 'omvandling',
            'Svinn vid omvandling' || coalesce(': ' || nullif(_waste_reason,''), ''), _staff);
  END IF;

  IF _source_lot_id IS NOT NULL THEN
    SELECT * INTO _src FROM lots WHERE id = _source_lot_id;
  END IF;

  IF _src.id IS NOT NULL THEN
    _lot_number := _src.lot_number || '-01-OMV';
    INSERT INTO lots(lot_number, product_id, quantity_kg, unit_cost, best_before, status, traceability_required,
      species_fao_code, latin_name, commercial_name, catch_area, fishing_gear, fishing_gear_code, production_method,
      is_thawed, catch_date_from, catch_date_to, vessel_name, vessel_reg, vessel_nation, supplier_id, grade,
      certificate, certified_program, origin_lot_id, supplier_lot_id)
    VALUES (_lot_number, _target_product_id, _output, _tcost, coalesce(_target_best_before, _src.best_before), 'aktiv', true,
      _src.species_fao_code, _src.latin_name, _src.commercial_name, _src.catch_area, _src.fishing_gear, _src.fishing_gear_code, _src.production_method,
      _src.is_thawed, _src.catch_date_from, _src.catch_date_to, _src.vessel_name, _src.vessel_reg, _src.vessel_nation, _src.supplier_id, _src.grade,
      _src.certificate, _src.certified_program, coalesce(_src.origin_lot_id, _src.lot_number), _src.supplier_lot_id)
    RETURNING id INTO _lot_id;
  ELSE
    _lot_number := 'OKAND-' || to_char(now(),'YYYY-MM-DD') || '-omvandli-01-OMV';
    INSERT INTO lots(lot_number, product_id, quantity_kg, unit_cost, best_before, status, traceability_required, catch_area)
    VALUES (_lot_number, _target_product_id, _output, _tcost, _target_best_before, 'aktiv', true,
            'Okänd härkomst — råvaruparti saknades vid tillverkning')
    RETURNING id INTO _lot_id;
  END IF;

  INSERT INTO stock_movements(product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, note, created_by)
  VALUES (_target_product_id, _location_id, _lot_id, 'tillverkning_in', _output, _tcost, 'omvandling', _label, _staff);

  IF _source_lot_id IS NOT NULL THEN
    INSERT INTO lot_transformations(from_lot_id, to_lot_id, quantity_in_kg, quantity_out_kg)
    VALUES (_source_lot_id, _lot_id, _amount, _output);
  END IF;

  _yield := round((_output / _amount) * 100, 1);

  INSERT INTO stock_transformations(store_id, location_id, transform_kind, source_product_id, source_lot_id, source_quantity,
    target_product_id, target_lot_id, target_quantity, target_packages, yield_pct, waste_quantity, waste_reason, note,
    performed_at, performed_by, performed_by_name)
  VALUES (_store_id, _location_id, _kind, _source_product_id, _source_lot_id, _amount,
    _target_product_id, _lot_id, _output, _target_packages, _yield, _waste, nullif(trim(_waste_reason),''), nullif(trim(_note),''),
    coalesce(_performed_at, now()), _staff, nullif(trim(_performed_by_name),''))
  RETURNING id INTO _hist;

  RETURN jsonb_build_object('yield_pct', _yield, 'target_lot_id', _lot_id, 'history_id', _hist);
END $$;

REVOKE ALL ON FUNCTION public.perform_lot_transformation(uuid,uuid,uuid,uuid,numeric,numeric,uuid,numeric,numeric,date,text,numeric,text,timestamptz,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_lot_transformation(uuid,uuid,uuid,uuid,numeric,numeric,uuid,numeric,numeric,date,text,numeric,text,timestamptz,text,text,text) TO authenticated;