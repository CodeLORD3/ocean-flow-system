WITH base AS (
  SELECT id, image_url,
         lower(regexp_replace(split_part(split_part(name, ',', 1), ' - ', 1), '\s+', ' ', 'g')) AS bn,
         updated_at
  FROM public.products
), src AS (
  SELECT DISTINCT ON (bn) bn, image_url
  FROM base
  WHERE image_url IS NOT NULL AND image_url <> ''
  ORDER BY bn, updated_at DESC NULLS LAST
)
UPDATE public.products p
SET image_url = src.image_url
FROM base b, src
WHERE b.id = p.id
  AND b.bn = src.bn
  AND (p.image_url IS NULL OR p.image_url = '');