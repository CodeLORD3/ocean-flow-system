UPDATE public.products p
SET purchasable = false,
    updated_at = now()
WHERE p.purchasable = true
  AND EXISTS (
    SELECT 1 FROM public.products v WHERE v.parent_product_id = p.id
  );