WITH ch AS (
  SELECT id FROM public.shopify_shops WHERE shop_domain = 'iqnb3f-ga.myshopify.com'
), m(title, sku) AS (
  VALUES
    ('Swedish Crayfish Medium','SK-002-K-STD'),
    ('Swedish Crayfish XL','SK-002-K-JUM'),
    ('Fresh Cooked Shrimps','FS-001-FR'),
    ('Smoked Shrimps','FS-001-ROK'),
    ('Peeled Shrimps in Brine','FS-009'),
    ('Fresh Cooked Langoustines','HAVS-001-K-M'),
    ('Fresh Cooked Crab Claws','FS-007-K-M'),
    ('Aioli 100g','KK-006-1HG'),
    ('Roe Sauce 100g','KK-009-1HG'),
    ('Bjarne Sauce','KK-010'),
    ('Västerbotten Cheese-pie','VK-009-VB'),
    ('Västerbottenost Norrmejerierna 450g','SV-008'),
    ('Senapssill','KK-013'),
    ('Smögensill','KK-015'),
    ('Classic Skagenröra','KK-003'),
    ('Lyxskagenröra','KK-003-LYX'),
    ('Swedish Kalix Bleak Roe (Löjrom)','KK-036-KAL'),
    ('Mom Anneli''s Fish Gratin 1pc','VK-002'),
    ('Matjessillfilé 3pcs','SI-032'),
    ('Lemon Sole Fillet 0.5kg','FS-023-FIL-BAS'),
    ('Salmon Fillet 0.5kg','LAX-001-FIL-MSK'),
    ('Gravlax Whole Fillet 1,6 - 1,8kg','KK-022-HEL'),
    ('Cold-Smoked Salmon Whole Fillet 1,6 - 1,8kg','FS-020-HEL'),
    ('Warm-smoked Salmon 500g','KK-032'),
    ('Bregott Extrasaltat Arla 250g','SV-010'),
    ('Bregott Normalsaltat Arla 250g','SV-009'),
    ('Falukorv 70% Härryda Karlsson 800g','SV-003'),
    ('Prästost Arla 720g','SV-006'),
    ('Kalles Kaviar Original 300g','SV-004')
)
INSERT INTO public.shopify_product_map (shopify_sku, shopify_title, product_id, shop_id)
SELECT m.title, m.title, p.id, ch.id
FROM m
JOIN public.products p ON p.sku = m.sku
CROSS JOIN ch
WHERE NOT EXISTS (
  SELECT 1 FROM public.shopify_product_map x
  WHERE lower(x.shopify_title) = lower(m.title)
);