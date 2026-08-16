-- 1) Variants inherit parent image
UPDATE public.products c
SET image_url = p.image_url
FROM public.products p
WHERE c.parent_product_id = p.id
  AND (c.image_url IS NULL OR c.image_url = '')
  AND p.image_url IS NOT NULL AND p.image_url <> '';

-- 2) Fallback: inherit from a sibling variant that has an image
UPDATE public.products c
SET image_url = s.image_url
FROM (
  SELECT DISTINCT ON (parent_product_id) parent_product_id, image_url
  FROM public.products
  WHERE parent_product_id IS NOT NULL AND image_url IS NOT NULL AND image_url <> ''
  ORDER BY parent_product_id, updated_at DESC NULLS LAST
) s
WHERE c.parent_product_id = s.parent_product_id
  AND (c.image_url IS NULL OR c.image_url = '');

-- 3) Parents without image get one from a variant
UPDATE public.products p
SET image_url = s.image_url
FROM (
  SELECT DISTINCT ON (parent_product_id) parent_product_id, image_url
  FROM public.products
  WHERE parent_product_id IS NOT NULL AND image_url IS NOT NULL AND image_url <> ''
  ORDER BY parent_product_id, updated_at DESC NULLS LAST
) s
WHERE p.id = s.parent_product_id
  AND (p.image_url IS NULL OR p.image_url = '');