CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('inkop_till_gross','gross_till_butik')),
  scope_type text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','category','product')),
  category text,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'margin_pct' CHECK (method IN ('margin_pct','markup_pct','fixed_price')),
  value numeric NOT NULL DEFAULT 0,
  rounding text NOT NULL DEFAULT 'krona' CHECK (rounding IN ('ingen','krona','krona_5','nittio')),
  yield_pct numeric,
  labour_per_unit numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 12,
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pricing_rules_lookup_idx ON public.pricing_rules (stage, scope_type, active);
CREATE INDEX pricing_rules_product_idx ON public.pricing_rules (product_id);
CREATE INDEX pricing_rules_store_idx ON public.pricing_rules (store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_pricing_rules" ON public.pricing_rules
  FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "managers_write_pricing_rules" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'wholesale_staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'wholesale_staff'));

CREATE TRIGGER pricing_rules_touch
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.pricing_round(_value numeric, _rounding text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _value IS NULL THEN NULL
    WHEN _rounding = 'ingen' THEN round(_value, 2)
    WHEN _rounding = 'krona' THEN ceil(_value)
    WHEN _rounding = 'krona_5' THEN ceil(_value / 5.0) * 5
    WHEN _rounding = 'nittio' THEN GREATEST(floor(_value) - 1, 0) + 0.90
    ELSE round(_value, 2)
  END
$$;

CREATE OR REPLACE FUNCTION public.pricing_pick_rule(_stage text, _product_id uuid, _category text, _store_id uuid)
RETURNS public.pricing_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.pricing_rules r
  WHERE r.active
    AND r.stage = _stage
    AND r.valid_from <= current_date
    AND (r.store_id IS NULL OR r.store_id = _store_id)
    AND (
      (r.scope_type = 'product' AND r.product_id = _product_id)
      OR (r.scope_type = 'category' AND r.category IS NOT DISTINCT FROM _category)
      OR (r.scope_type = 'global')
    )
  ORDER BY
    CASE r.scope_type WHEN 'product' THEN 0 WHEN 'category' THEN 1 ELSE 2 END,
    CASE WHEN r.store_id IS NOT NULL THEN 0 ELSE 1 END,
    r.valid_from DESC,
    r.updated_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pricing_apply(_base numeric, _rule public.pricing_rules)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  adjusted numeric;
  raw numeric;
BEGIN
  IF _rule.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _rule.method = 'fixed_price' THEN
    RETURN public.pricing_round(_rule.value, _rule.rounding);
  END IF;

  IF _base IS NULL THEN
    RETURN NULL;
  END IF;

  adjusted := _base;
  IF _rule.yield_pct IS NOT NULL AND _rule.yield_pct > 0 THEN
    adjusted := adjusted / (_rule.yield_pct / 100.0);
  END IF;
  adjusted := adjusted + COALESCE(_rule.labour_per_unit, 0);

  IF _rule.method = 'margin_pct' THEN
    IF _rule.value >= 100 THEN
      RETURN NULL;
    END IF;
    raw := adjusted / (1 - (_rule.value / 100.0));
  ELSE
    raw := adjusted * (1 + (_rule.value / 100.0));
  END IF;

  RETURN public.pricing_round(raw, _rule.rounding);
END;
$$;

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
  gross numeric;
  retail numeric;
  retail_incl numeric;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','product_not_found');
  END IF;

  base := COALESCE(p.day_price, p.cost_price);

  r1 := public.pricing_pick_rule('inkop_till_gross', p.id, p.category, NULL);
  r2 := public.pricing_pick_rule('gross_till_butik', p.id, p.category, _store_id);

  gross := public.pricing_apply(base, r1);
  IF gross IS NULL THEN
    gross := p.wholesale_price;
  END IF;

  retail := public.pricing_apply(gross, r2);
  IF retail IS NULL THEN
    retail := p.retail_suggested;
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
    'purchase_source', CASE WHEN p.day_price IS NOT NULL THEN 'day_price' ELSE 'cost_price' END,
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

INSERT INTO public.pricing_rules (stage, scope_type, method, value, rounding, note)
VALUES
  ('inkop_till_gross','global','margin_pct',22,'krona','Standardmarginal grossist'),
  ('gross_till_butik','global','markup_pct',35,'krona','Standardpåslag butik');