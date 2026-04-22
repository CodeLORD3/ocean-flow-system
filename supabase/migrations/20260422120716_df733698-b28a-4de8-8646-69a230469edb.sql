-- Step 1: Add article_sku FK to pos_products
ALTER TABLE public.pos_products
  ADD COLUMN IF NOT EXISTS article_sku text;

ALTER TABLE public.pos_products
  DROP CONSTRAINT IF EXISTS pos_products_article_sku_fkey;

-- Note: makrilltrade_articles_cache.sku is not unique today, but article_id is.
-- We use sku for human readability; add unique constraint to make FK valid.
ALTER TABLE public.makrilltrade_articles_cache
  DROP CONSTRAINT IF EXISTS makrilltrade_articles_cache_sku_unique;
ALTER TABLE public.makrilltrade_articles_cache
  ADD CONSTRAINT makrilltrade_articles_cache_sku_unique UNIQUE (sku);

ALTER TABLE public.pos_products
  ADD CONSTRAINT pos_products_article_sku_fkey
  FOREIGN KEY (article_sku)
  REFERENCES public.makrilltrade_articles_cache(sku)
  ON DELETE SET NULL;

-- Step 2: Wipe + re-seed makrilltrade caches with the canonical 8-article seed
-- Drop dependent rows first (allocations + overrides + rules)
DELETE FROM public.batch_allocations
  WHERE article_id IN (SELECT article_id FROM public.makrilltrade_articles_cache);
DELETE FROM public.price_overrides
  WHERE article_id IN (SELECT article_id FROM public.makrilltrade_articles_cache);
DELETE FROM public.scomber_pricing_rules
  WHERE article_id IN (SELECT article_id FROM public.makrilltrade_articles_cache);
DELETE FROM public.makrilltrade_batches_cache;
DELETE FROM public.makrilltrade_articles_cache;

-- Articles (article_id = sku for simplicity, matches Fastify reference)
INSERT INTO public.makrilltrade_articles_cache
  (article_id, sku, name, category, unit, vat_rate, default_price_ore, active, raw)
VALUES
  ('LAX-HEL-001', 'LAX-HEL-001', 'Lax, färsk hel',     'Färsk fisk',   'kg',    6, 22900, true, jsonb_build_object('species','Salmo salar')),
  ('LAX-FIL-001', 'LAX-FIL-001', 'Laxfilé m skinn',    'Färsk fisk',   'kg',    6, 32900, true, jsonb_build_object('species','Salmo salar')),
  ('TOR-FIL-001', 'TOR-FIL-001', 'Torsk, färsk filé',  'Färsk fisk',   'kg',    6, 29900, true, jsonb_build_object('species','Gadus morhua')),
  ('RAK-SKA-001', 'RAK-SKA-001', 'Räkor, skalade i lag','Skaldjur',    'piece', 6,  6900, true, jsonb_build_object('species','Pandalus borealis')),
  ('HUM-LEV-001', 'HUM-LEV-001', 'Hummer, levande',    'Skaldjur',     'piece', 6, 69000, true, jsonb_build_object('species','Homarus gammarus')),
  ('OST-BOH-001', 'OST-BOH-001', 'Ostron, bohuslän',   'Skaldjur',     'piece', 6,  3500, true, jsonb_build_object('species','Ostrea edulis')),
  ('GRA-LAX-001', 'GRA-LAX-001', 'Gravad lax, skivad', 'Rökt & gravat','kg',    6, 32900, true, jsonb_build_object('species','Salmo salar')),
  ('PAS-GUL-001', 'PAS-GUL-001', 'Papperspåse gul stor','Torrvaror',   'piece',25,   500, true, '{}'::jsonb);

-- Batches (date math: today, daysAgo(1), daysAgo(2), etc.)
-- raw contains origin/vessel/MSC + purchase price for FIFO cost basis
INSERT INTO public.makrilltrade_batches_cache
  (batch_id, article_id, caught_at, best_before, supplier_name, quantity_remaining, unit, raw)
VALUES
  -- Lax — older batch (cheaper)
  ('B-LAX-20260420-N1', 'LAX-HEL-001',
   CURRENT_DATE - 2, CURRENT_DATE + 3, 'Salmar ASA', 30000, 'g',
   jsonb_build_object(
     'vessel','MS Nordlyset','fao_zone','FAO 27.IV.a',
     'msc_certified',true,'asc_certified',false,
     'country_of_origin','NO',
     'purchase_price_ore', round(12500 * 0.98)::int,
     'purchase_currency','NOK','fx_rate_to_sek',0.98
   )),
  -- Lax — newer batch (more expensive)
  ('B-LAX-20260422-N2', 'LAX-HEL-001',
   CURRENT_DATE, CURRENT_DATE + 5, 'Salmar ASA', 73000, 'g',
   jsonb_build_object(
     'vessel','MS Havbris','fao_zone','FAO 27.IV.a',
     'msc_certified',true,'asc_certified',false,
     'country_of_origin','NO',
     'purchase_price_ore', round(13200 * 0.98)::int,
     'purchase_currency','NOK','fx_rate_to_sek',0.98
   )),
  -- Laxfilé
  ('B-LAXFIL-20260421-N1', 'LAX-FIL-001',
   CURRENT_DATE - 1, CURRENT_DATE + 3, 'Salmar ASA', 14000, 'g',
   jsonb_build_object(
     'vessel','MS Havbris','fao_zone','FAO 27.IV.a',
     'msc_certified',true,'asc_certified',false,
     'country_of_origin','NO',
     'purchase_price_ore', round(19500 * 0.98)::int,
     'purchase_currency','NOK','fx_rate_to_sek',0.98
   )),
  -- Torsk
  ('B-TOR-20260420-I1', 'TOR-FIL-001',
   CURRENT_DATE - 3, CURRENT_DATE + 2, 'Iceland Seafood', 13000, 'g',
   jsonb_build_object(
     'vessel','MS Hafborg','fao_zone','FAO 27.II.a',
     'msc_certified',true,'asc_certified',false,
     'country_of_origin','IS',
     'purchase_price_ore', round(1850 * 11.52)::int,
     'purchase_currency','EUR','fx_rate_to_sek',11.52
   )),
  -- Räkor
  ('B-RAK-20260418-S1', 'RAK-SKA-001',
   CURRENT_DATE - 5, CURRENT_DATE + 10, 'Räksjön AB', 35, 'piece',
   jsonb_build_object(
     'vessel','MS Gärdvik','fao_zone','FAO 27.IIIa',
     'msc_certified',true,'asc_certified',false,
     'country_of_origin','SE',
     'purchase_price_ore', 4500,
     'purchase_currency','SEK','fx_rate_to_sek',1.0
   )),
  -- Hummer
  ('B-HUM-20260422-S1', 'HUM-LEV-001',
   CURRENT_DATE - 1, CURRENT_DATE + 2, 'Bohus Havsfisk', 20, 'piece',
   jsonb_build_object(
     'vessel','MS Skagerrak','fao_zone','FAO 27.IIIa',
     'msc_certified',false,'asc_certified',false,
     'country_of_origin','SE',
     'purchase_price_ore', 45000,
     'purchase_currency','SEK','fx_rate_to_sek',1.0
   )),
  -- Ostron
  ('B-OST-20260421-S1', 'OST-BOH-001',
   CURRENT_DATE - 1, CURRENT_DATE + 5, 'Ostronakademin', 140, 'piece',
   jsonb_build_object(
     'vessel','Handplockade','fao_zone','FAO 27.IIIa',
     'msc_certified',false,'asc_certified',false,
     'country_of_origin','SE',
     'purchase_price_ore', 1800,
     'purchase_currency','SEK','fx_rate_to_sek',1.0
   )),
  -- Gravad lax (own production)
  ('B-GRAVLAX-20260421-E1', 'GRA-LAX-001',
   NULL, CURRENT_DATE + 7, 'Eget tillverkat', 3000, 'g',
   jsonb_build_object(
     'vessel',NULL,'fao_zone',NULL,
     'msc_certified',false,'asc_certified',false,
     'country_of_origin','SE',
     'purchase_price_ore', 18000,
     'purchase_currency','SEK','fx_rate_to_sek',1.0
   )),
  -- Påsar
  ('B-PAS-20260415-S1', 'PAS-GUL-001',
   NULL, NULL, 'Emballage Väst', 500, 'piece',
   jsonb_build_object(
     'vessel',NULL,'fao_zone',NULL,
     'msc_certified',false,'asc_certified',false,
     'country_of_origin','SE',
     'purchase_price_ore', 200,
     'purchase_currency','SEK','fx_rate_to_sek',1.0
   ));

-- Pricing rules (store_multiplier keyed by real store UUIDs)
-- Mapping: amhult -> Amhult, saro -> Särö, torslanda -> Torget (volume store)
INSERT INTO public.scomber_pricing_rules
  (article_id, strategy, markup_percent, target_margin_percent, fixed_price_ore,
   min_price_ore, max_price_ore, store_multiplier)
VALUES
  ('LAX-HEL-001', 'markup',         45, NULL, NULL, 18000, 35000,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 0.95
   )),
  ('LAX-FIL-001', 'target-margin', NULL,   32, NULL, 25000, 45000,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 0.95
   )),
  ('TOR-FIL-001', 'markup',         40, NULL, NULL, 22000, 40000,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 0.95
   )),
  ('RAK-SKA-001', 'markup',         35, NULL, NULL,  5500,  9500,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 1.00
   )),
  ('HUM-LEV-001', 'target-margin', NULL,   30, NULL, 50000, 90000,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.20,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 0.95
   )),
  ('OST-BOH-001', 'markup',         60, NULL, NULL,  2500,  5500,
   jsonb_build_object(
     '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,
     '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,
     'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 1.00
   )),
  ('GRA-LAX-001', 'fixed',         NULL, NULL, 32900, NULL, NULL, '{}'::jsonb),
  ('PAS-GUL-001', 'fixed',         NULL, NULL,   500, NULL, NULL, '{}'::jsonb);

-- Step 3: Link pos_products to articles via article_sku
-- Match by best fit on existing POS sample products
UPDATE public.pos_products SET article_sku = 'LAX-HEL-001' WHERE sku = 'FF-001';
UPDATE public.pos_products SET article_sku = 'LAX-FIL-001' WHERE sku = 'FF-002';
UPDATE public.pos_products SET article_sku = 'TOR-FIL-001' WHERE sku = 'FF-003';
UPDATE public.pos_products SET article_sku = 'RAK-SKA-001' WHERE sku = 'SK-001';
UPDATE public.pos_products SET article_sku = 'HUM-LEV-001' WHERE sku = 'SK-004';
UPDATE public.pos_products SET article_sku = 'GRA-LAX-001' WHERE sku = 'RG-001';