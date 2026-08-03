-- 1. margin_targets: prislista per kanal
ALTER TABLE public.margin_targets
  ADD COLUMN IF NOT EXISTS price_list text,
  ADD COLUMN IF NOT EXISTS applies_to text;

UPDATE public.margin_targets SET price_list = 'butik_goteborg', applies_to = 'butik'
  WHERE region = 'vast';

-- Stockholm-raden blir grossistlistan
UPDATE public.margin_targets
   SET region = 'grossist',
       label = 'Grossist (DE No.1 AB Stockholm, Componia AG Schweiz)',
       target_pct = 22,
       price_list = 'grossist',
       applies_to = 'grossist',
       updated_at = now()
 WHERE region = 'stockholm';

UPDATE public.margin_targets SET price_list = region WHERE price_list IS NULL;
UPDATE public.margin_targets SET applies_to = 'butik' WHERE applies_to IS NULL;

ALTER TABLE public.margin_targets
  ALTER COLUMN price_list SET NOT NULL,
  ALTER COLUMN applies_to SET NOT NULL,
  ALTER COLUMN applies_to SET DEFAULT 'butik';

CREATE UNIQUE INDEX IF NOT EXISTS margin_targets_price_list_key
  ON public.margin_targets (price_list);

-- 2. detail_prices: pris per prislista
ALTER TABLE public.detail_prices
  ADD COLUMN IF NOT EXISTS price_list text NOT NULL DEFAULT 'butik_goteborg',
  ADD COLUMN IF NOT EXISTS cut_form text,
  ADD COLUMN IF NOT EXISTS price_incl_vat numeric(12,2),
  ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT current_date;

UPDATE public.detail_prices SET cut_form = COALESCE(cut_form, detail_form);
UPDATE public.detail_prices SET price_incl_vat = COALESCE(price_incl_vat, last_set_price);

-- 3. flytta in biproduktpriser i butiksprislistan
INSERT INTO public.detail_prices (species_group, detail_form, cut_form, price_list, price_incl_vat, last_set_price, role)
SELECT b.species_group, b.detail_form, b.detail_form, 'butik_goteborg', b.price_incl_vat, b.price_incl_vat, 'byproduct'
  FROM public.byproduct_prices b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.detail_prices d
    WHERE d.price_list = 'butik_goteborg'
      AND d.species_group = b.species_group
      AND d.detail_form = b.detail_form
 );

UPDATE public.detail_prices d
   SET price_incl_vat = COALESCE(d.price_incl_vat, b.price_incl_vat),
       updated_at = now()
  FROM public.byproduct_prices b
 WHERE d.price_list = 'butik_goteborg'
   AND d.species_group = b.species_group
   AND d.detail_form = b.detail_form
   AND d.price_incl_vat IS NULL;

DROP TABLE public.byproduct_prices;

-- 4. ett pris per prislista och detalj
DELETE FROM public.detail_prices d
 USING public.detail_prices d2
 WHERE d.price_list = d2.price_list
   AND d.species_group = d2.species_group
   AND d.detail_form = d2.detail_form
   AND d.ctid > d2.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS detail_prices_list_species_form_key
  ON public.detail_prices (price_list, species_group, detail_form);