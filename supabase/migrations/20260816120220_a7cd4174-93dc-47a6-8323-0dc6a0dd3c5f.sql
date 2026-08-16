UPDATE public.products
SET cost_price_source = 'import', updated_at = now()
WHERE cost_price_source = 'platshallare'
  AND cost_price IS NOT NULL
  AND cost_price > 1;