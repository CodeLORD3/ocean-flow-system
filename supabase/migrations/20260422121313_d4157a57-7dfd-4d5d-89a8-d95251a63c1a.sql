INSERT INTO public.makrilltrade_batches_cache (batch_id, article_id, supplier_name, caught_at, best_before, quantity_remaining, unit, raw)
VALUES (
  'B-LAX-20260419-PREMIUM',
  'LAX-HEL-001',
  'Bremnes Seashore',
  '2026-04-19',
  '2026-04-24',
  15000,
  'g',
  '{"vessel":"MS Salar Premium","country_of_origin":"NO","fao_zone":"FAO 27.IV.a","msc_certified":true,"asc_certified":true,"purchase_currency":"NOK","fx_rate_to_sek":0.98,"purchase_price_ore":25000}'::jsonb
)
ON CONFLICT (batch_id) DO UPDATE SET
  raw = EXCLUDED.raw,
  caught_at = EXCLUDED.caught_at,
  quantity_remaining = EXCLUDED.quantity_remaining,
  supplier_name = EXCLUDED.supplier_name;