ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sku_prefix text,
  ADD COLUMN IF NOT EXISTS traceability_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_store_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS wholesale_visible boolean NOT NULL DEFAULT true;

INSERT INTO public.categories (name, sku_prefix, exempt_species_data, traceability_exempt, visible_store_ids, wholesale_visible)
SELECT 'Svenska specerivaror', 'SV', true, true, ARRAY['93adfded-5d68-41e3-9b00-c3b3db4f5ee4']::uuid[], true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE lower(name) = lower('Svenska specerivaror'));