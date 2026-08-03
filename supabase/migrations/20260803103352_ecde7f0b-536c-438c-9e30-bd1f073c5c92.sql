UPDATE public.products
SET requires_processing = true
WHERE active = true
  AND (
    category = 'Färsk Fisk'
    OR (category = 'Skaldjur' AND (name ILIKE '%levande%' OR name ILIKE '%rå %' OR name ILIKE 'rå%'))
  );