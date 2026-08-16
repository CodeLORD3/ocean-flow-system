UPDATE public.products
SET image_url = 'https://cdn.shopify.com/s/files/1/0828/2544/5642/files/MG_0257.jpg', updated_at = now()
WHERE coalesce(image_url,'') = '' AND (sku = 'KK-016' OR sku LIKE 'KK-016-%' OR sku = 'SI-018' OR sku LIKE 'SI-018-%');

UPDATE public.products
SET image_url = 'https://cdn.shopify.com/s/files/1/0828/2544/5642/files/p1055550.jpg', updated_at = now()
WHERE coalesce(image_url,'') = '' AND (sku = 'SI-021' OR sku LIKE 'SI-021-%');