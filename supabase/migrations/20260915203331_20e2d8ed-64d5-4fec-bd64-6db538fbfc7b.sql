CREATE OR REPLACE FUNCTION public.pricing_calc(_product_id uuid, _store_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products;
  r1 public.pricing_rules;
  r2 public.pricing_rules;
  base numeric;
  base_source text;
  gross numeric;
  retail numeric;
  retail_incl numeric;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','product_not_found');
  END IF;

  IF COALESCE(p.day_price, 0) > 0 AND COALESCE(p.day_price_lots, 0) > 0 THEN
    base := p.day_price;
    base_source := 'day_price';
  ELSE
    base := NULLIF(COALESCE(p.cost_price, 0), 0);
    base_source := 'cost_price';
  END IF;

  r1 := public.pricing_pick_rule('inkop_till_gross', p.id, p.category, NULL);
  r2 := public.pricing_pick_rule('gross_till_butik', p.id, p.category, _store_id);

  gross := public.pricing_apply(base, r1);
  IF gross IS NULL THEN
    gross := NULLIF(COALESCE(p.wholesale_price, 0), 0);
  END IF;

  retail := public.pricing_apply(gross, r2);
  IF retail IS NULL THEN
    retail := NULLIF(COALESCE(p.retail_suggested, 0), 0);
  END IF;

  IF retail IS NOT NULL THEN
    retail_incl := round(retail * (1 + COALESCE(r2.vat_rate, 12) / 100.0), 2);
  END IF;

  RETURN jsonb_build_object(
    'product_id', p.id,
    'product_name', p.name,
    'category', p.category,
    'unit', p.unit,
    'purchase_price', base,
    'purchase_source', base_source,
    'wholesale_price', gross,
    'wholesale_rule_id', r1.id,
    'wholesale_rule_method', r1.method,
    'wholesale_rule_value', r1.value,
    'wholesale_margin_pct', CASE WHEN gross IS NOT NULL AND gross > 0 AND base IS NOT NULL THEN round(((gross - base) / gross) * 100, 1) END,
    'retail_price', retail,
    'retail_price_incl_vat', retail_incl,
    'vat_rate', COALESCE(r2.vat_rate, 12),
    'retail_rule_id', r2.id,
    'retail_rule_method', r2.method,
    'retail_rule_value', r2.value,
    'retail_margin_pct', CASE WHEN retail IS NOT NULL AND retail > 0 AND gross IS NOT NULL THEN round(((retail - gross) / retail) * 100, 1) END,
    'store_id', _store_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pricing_calc(uuid, uuid) FROM anon;