
-- Seed makrilltrade_articles_cache: en artikel per aktiv POS-produkt (article_id = pos_products.sku)
INSERT INTO public.makrilltrade_articles_cache (article_id, sku, name, category, unit, vat_rate, default_price_ore, active, raw)
SELECT
  pp.sku                                         AS article_id,
  pp.sku                                         AS sku,
  pp.name                                        AS name,
  pp.category                                    AS category,
  CASE WHEN pp.unit_type = 'kg' THEN 'kg' ELSE 'piece' END AS unit,
  pp.vat_rate                                    AS vat_rate,
  pp.price_ore                                   AS default_price_ore,
  true                                           AS active,
  jsonb_build_object(
    'species_latin', CASE
      WHEN pp.name ILIKE '%lax%' THEN 'Salmo salar'
      WHEN pp.name ILIKE '%torsk%' THEN 'Gadus morhua'
      WHEN pp.name ILIKE '%kolja%' THEN 'Melanogrammus aeglefinus'
      WHEN pp.name ILIKE '%hälleflundra%' THEN 'Hippoglossus hippoglossus'
      WHEN pp.name ILIKE '%röding%' THEN 'Salvelinus alpinus'
      WHEN pp.name ILIKE '%makrill%' THEN 'Scomber scombrus'
      WHEN pp.name ILIKE '%sik%' THEN 'Coregonus lavaretus'
      WHEN pp.name ILIKE '%räk%' THEN 'Pandalus borealis'
      WHEN pp.name ILIKE '%krabba%' THEN 'Cancer pagurus'
      WHEN pp.name ILIKE '%hummer%' THEN 'Homarus gammarus'
      WHEN pp.name ILIKE '%mussla%' OR pp.name ILIKE '%musslor%' THEN 'Mytilus edulis'
      ELSE NULL
    END,
    'msc_certified', (pp.name ILIKE '%torsk%' OR pp.name ILIKE '%kolja%' OR pp.name ILIKE '%makrill%' OR pp.name ILIKE '%räk%')
  )                                              AS raw
FROM public.pos_products pp
WHERE pp.active = true
ON CONFLICT (article_id) DO UPDATE
  SET name              = EXCLUDED.name,
      sku               = EXCLUDED.sku,
      category          = EXCLUDED.category,
      unit              = EXCLUDED.unit,
      vat_rate          = EXCLUDED.vat_rate,
      default_price_ore = EXCLUDED.default_price_ore,
      raw               = EXCLUDED.raw,
      synced_at         = now();

-- Seed makrilltrade_batches_cache: 2 batcher per artikel (en äldre, en nyare) med inköpspris och ursprung
WITH src AS (
  SELECT
    a.article_id,
    a.unit,
    a.default_price_ore,
    -- enkel "kostnadsbas" runt 60% av detaljpris (för en realistisk marginal)
    GREATEST(100, (a.default_price_ore * 0.6)::int) AS cost_ore,
    -- ursprungsland baserat på namn
    CASE
      WHEN a.name ILIKE '%lax%' OR a.name ILIKE '%röding%' THEN 'NO'
      WHEN a.name ILIKE '%torsk%' OR a.name ILIKE '%kolja%' OR a.name ILIKE '%hälleflundra%' THEN 'IS'
      WHEN a.name ILIKE '%räk%' THEN 'GL'
      WHEN a.name ILIKE '%krabba%' OR a.name ILIKE '%hummer%' OR a.name ILIKE '%musslor%' OR a.name ILIKE '%mussla%' THEN 'SE'
      WHEN a.name ILIKE '%makrill%' OR a.name ILIKE '%sik%' THEN 'SE'
      ELSE 'SE'
    END                                              AS country,
    CASE
      WHEN a.name ILIKE '%lax%' THEN 'MS Havbris'
      WHEN a.name ILIKE '%torsk%' THEN 'MS Nordkapp'
      WHEN a.name ILIKE '%kolja%' THEN 'MS Eystrasalt'
      WHEN a.name ILIKE '%räk%' THEN 'MS Sigurd'
      WHEN a.name ILIKE '%makrill%' THEN 'MS Vesterhav'
      WHEN a.name ILIKE '%krabba%' OR a.name ILIKE '%hummer%' THEN 'MS Smögen'
      ELSE NULL
    END                                              AS vessel,
    CASE
      WHEN a.name ILIKE '%lax%' OR a.name ILIKE '%torsk%' OR a.name ILIKE '%kolja%' THEN 'FAO 27.IV.a'
      WHEN a.name ILIKE '%räk%' THEN 'FAO 21'
      WHEN a.name ILIKE '%makrill%' OR a.name ILIKE '%sik%' THEN 'FAO 27.III.d'
      WHEN a.name ILIKE '%krabba%' OR a.name ILIKE '%hummer%' OR a.name ILIKE '%mussla%' THEN 'FAO 27.III.a'
      ELSE NULL
    END                                              AS fao_zone,
    CASE
      WHEN a.name ILIKE '%lax%' THEN 'Norfisk AS'
      WHEN a.name ILIKE '%torsk%' OR a.name ILIKE '%kolja%' OR a.name ILIKE '%hälleflundra%' THEN 'Iceland Fresh ehf'
      WHEN a.name ILIKE '%räk%' THEN 'Royal Greenland'
      WHEN a.name ILIKE '%krabba%' OR a.name ILIKE '%hummer%' THEN 'Smögen Skaldjur AB'
      WHEN a.name ILIKE '%mussla%' OR a.name ILIKE '%musslor%' THEN 'Scanfjord AB'
      ELSE 'Lokal leverantör'
    END                                              AS supplier,
    (a.raw ->> 'msc_certified')::boolean             AS msc
  FROM public.makrilltrade_articles_cache a
)
INSERT INTO public.makrilltrade_batches_cache
  (batch_id, article_id, supplier_name, caught_at, best_before, quantity_remaining, unit, raw)
SELECT
  src.article_id || '-B' || gs                          AS batch_id,
  src.article_id                                        AS article_id,
  src.supplier                                          AS supplier_name,
  (CURRENT_DATE - (gs * 3 + 1))::date                   AS caught_at,
  (CURRENT_DATE + (CASE WHEN src.unit = 'kg' THEN 6 ELSE 30 END))::date AS best_before,
  CASE WHEN src.unit = 'kg' THEN 25 + (gs * 12) ELSE 80 + (gs * 20) END  AS quantity_remaining,
  src.unit                                              AS unit,
  jsonb_build_object(
    'purchase_price_ore', src.cost_ore,
    'country_of_origin', src.country,
    'vessel', src.vessel,
    'fao_zone', src.fao_zone,
    'msc_certified', COALESCE(src.msc, false),
    'asc_certified', false
  )                                                     AS raw
FROM src CROSS JOIN generate_series(1, 2) AS gs
ON CONFLICT (batch_id) DO UPDATE
  SET supplier_name      = EXCLUDED.supplier_name,
      caught_at          = EXCLUDED.caught_at,
      best_before        = EXCLUDED.best_before,
      quantity_remaining = EXCLUDED.quantity_remaining,
      unit               = EXCLUDED.unit,
      raw                = EXCLUDED.raw,
      synced_at          = now();

-- Seed scomber_pricing_rules: target-margin för fisk, markup för delikatess, fixed för torrvaror
INSERT INTO public.scomber_pricing_rules
  (article_id, strategy, markup_percent, target_margin_percent, fixed_price_ore, min_price_ore, max_price_ore, store_multiplier)
SELECT
  a.article_id,
  CASE
    WHEN a.category IN ('Färsk fisk', 'Skaldjur')      THEN 'target-margin'
    WHEN a.category IN ('Rökt & gravat', 'Delikatess') THEN 'markup'
    ELSE 'fixed'
  END AS strategy,
  CASE WHEN a.category IN ('Rökt & gravat', 'Delikatess') THEN 55 ELSE NULL END AS markup_percent,
  CASE WHEN a.category IN ('Färsk fisk', 'Skaldjur')      THEN 38 ELSE NULL END AS target_margin_percent,
  CASE WHEN a.category NOT IN ('Färsk fisk', 'Skaldjur', 'Rökt & gravat', 'Delikatess') THEN a.default_price_ore ELSE NULL END AS fixed_price_ore,
  GREATEST(1000, (a.default_price_ore * 0.7)::int)        AS min_price_ore,
  (a.default_price_ore * 1.6)::int                        AS max_price_ore,
  jsonb_build_object(
    '1426d0bb-dd09-46be-9d11-bc96d203eede', 1.00,    -- Amhult: bas
    '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', 1.15,    -- Särö: premium
    'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', 1.05,    -- Torget
    'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7', 1.20,    -- Stockholm
    '93adfded-5d68-41e3-9b00-c3b3db4f5ee4', 1.30     -- Zollikon (CHF-marknad)
  ) AS store_multiplier
FROM public.makrilltrade_articles_cache a
ON CONFLICT (article_id) DO UPDATE
  SET strategy              = EXCLUDED.strategy,
      markup_percent        = EXCLUDED.markup_percent,
      target_margin_percent = EXCLUDED.target_margin_percent,
      fixed_price_ore       = EXCLUDED.fixed_price_ore,
      min_price_ore         = EXCLUDED.min_price_ore,
      max_price_ore         = EXCLUDED.max_price_ore,
      store_multiplier      = EXCLUDED.store_multiplier;
