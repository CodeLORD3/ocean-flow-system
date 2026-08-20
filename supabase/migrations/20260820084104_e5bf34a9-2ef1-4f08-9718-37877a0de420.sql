CREATE OR REPLACE FUNCTION public.shopify_match_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    lower(translate(coalesce(v,''), 'ÅÄÖÜÉåäöüé', 'AAOUEaaoue')),
    '[^a-z0-9]', '', 'g')
$$;

WITH kandidat AS (
  SELECT l.id AS line_id, p.id AS product_id, p.unit
  FROM public.customer_order_lines l
  JOIN public.shopify_product_map m
    ON public.shopify_match_key(m.shopify_sku) IN (
         public.shopify_match_key(l.shopify_sku),
         public.shopify_match_key(l.shopify_title)
       )
    OR public.shopify_match_key(m.shopify_title) IN (
         public.shopify_match_key(l.shopify_sku),
         public.shopify_match_key(l.shopify_title)
       )
  JOIN public.products p ON p.id = m.product_id AND p.active
  WHERE l.needs_product_match
),
direkt AS (
  SELECT l.id AS line_id, p.id AS product_id, p.unit
  FROM public.customer_order_lines l
  JOIN public.products p
    ON p.active AND (
      public.shopify_match_key(p.sku) = public.shopify_match_key(l.shopify_sku)
      OR public.shopify_match_key(p.name) = public.shopify_match_key(l.shopify_title)
    )
  WHERE l.needs_product_match
),
alla AS (
  SELECT DISTINCT ON (line_id) line_id, product_id, unit
  FROM (SELECT * FROM kandidat UNION ALL SELECT * FROM direkt) t
  ORDER BY line_id, product_id
)
UPDATE public.customer_order_lines l
SET product_id = a.product_id,
    is_free_text = false,
    free_text_name = NULL,
    needs_product_match = false,
    unit = CASE WHEN lower(coalesce(a.unit,'kg')) IN ('st','stk','styck','pcs','pc','piece') THEN 'st' ELSE 'kg' END,
    updated_at = now()
FROM alla a
WHERE l.id = a.line_id;