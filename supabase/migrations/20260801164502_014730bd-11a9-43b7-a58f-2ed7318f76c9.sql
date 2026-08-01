-- Flytta lager från kategori-sublager upp till sitt Försäljningslager
WITH cat_subs AS (
  SELECT s.id, s.parent_location_id
  FROM public.storage_locations s
  WHERE s.parent_location_id IS NOT NULL AND s.category IS NOT NULL
)
UPDATE public.product_stock_locations psl
SET location_id = cs.parent_location_id
FROM cat_subs cs
WHERE psl.location_id = cs.id
  AND NOT EXISTS (
    SELECT 1 FROM public.product_stock_locations p2
    WHERE p2.location_id = cs.parent_location_id AND p2.product_id = psl.product_id
  );

-- Slå ihop dubbletter (samma produkt fanns redan på huvudlagret)
WITH cat_subs AS (
  SELECT s.id, s.parent_location_id
  FROM public.storage_locations s
  WHERE s.parent_location_id IS NOT NULL AND s.category IS NOT NULL
), dupes AS (
  SELECT psl.id, psl.product_id, psl.quantity, cs.parent_location_id
  FROM public.product_stock_locations psl
  JOIN cat_subs cs ON cs.id = psl.location_id
)
UPDATE public.product_stock_locations target
SET quantity = target.quantity + d.quantity
FROM dupes d
WHERE target.location_id = d.parent_location_id AND target.product_id = d.product_id;

DELETE FROM public.product_stock_locations psl
USING public.storage_locations s
WHERE psl.location_id = s.id AND s.parent_location_id IS NOT NULL AND s.category IS NOT NULL;

DELETE FROM public.storage_locations
WHERE parent_location_id IS NOT NULL AND category IS NOT NULL;