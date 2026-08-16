-- 1. Ärv bild från namnlika syskon/förälder
WITH b AS (
  SELECT id, name, image_url,
         lower(regexp_replace(name, '\s*(\d+([.,]\d+)?\s*(hg|kg|g|l|ml|st)|lösvikt|hink|glasburk|burk|flak.*|\(.*\))\s*.*$', '', 'i')) AS base
  FROM public.products
  WHERE active IS NOT FALSE
), src AS (
  SELECT base, min(image_url) AS image_url
  FROM b
  WHERE coalesce(image_url, '') <> ''
  GROUP BY base
)
UPDATE public.products p
SET image_url = s.image_url, updated_at = now()
FROM b x
JOIN src s ON s.base = x.base
WHERE p.id = x.id AND coalesce(p.image_url, '') = '';

-- 2. Massmarkera allergenkontroll för produkter som redan har ifylld allergenlista
UPDATE public.products
SET allergens_checked = true, updated_at = now()
WHERE active IS NOT FALSE
  AND allergens_checked IS NOT TRUE
  AND allergens IS NOT NULL
  AND cardinality(allergens) > 0;

-- 3. Grillspett special: konsumentpris 179 kr
UPDATE public.products
SET booking_circa_price = 179, updated_at = now()
WHERE sku = 'DE-GRILLSPETT-SPECIAL';