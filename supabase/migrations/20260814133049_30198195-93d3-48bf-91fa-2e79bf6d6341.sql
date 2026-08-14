UPDATE public.products
SET bookable_online = true
WHERE active
  AND parent_product_id IS NULL
  AND coalesce(bookable_online, false) = false
  AND category IN (
    'Färsk Fisk','Skaldjur','Sillar','Rökta Produkter','Löjrom & Kaviar',
    'Såser & Röror','Varmkök','Delikatesser','Konserver & Torkat','Frys','Frukt & Grönt'
  );