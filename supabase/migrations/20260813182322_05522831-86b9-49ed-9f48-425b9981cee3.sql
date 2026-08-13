ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price_source text;
INSERT INTO public.transformation_recipes (raw_product_id, output_product_id, yield_pct, transform_type, surcharge_per_kg, notes)
SELECT r.id, o.id, 90, 'kokning', 35, 'Autogenererat recept för kokt skaldjur'
FROM public.products o JOIN public.products r ON r.sku = replace(o.sku,'-K-','-R-')
WHERE o.sku LIKE 'FS-007-K-%' OR o.sku LIKE 'HAVS-001-K-%'
ON CONFLICT (raw_product_id, output_product_id, transform_type) DO NOTHING;
UPDATE public.products p SET cost_price=v.c, cost_price_inherited=false, cost_price_source='recept', updated_at=now() FROM (VALUES ('FS-007-K-L',368.33),('FS-007-K-M',368.33),('FS-007-K-S',368.33),('FS-007-K-XL',368.33),('HAVS-001-K-L',551.67),('HAVS-001-K-M',315.14),('HAVS-001-K-S',265.31),('HAVS-001-K-XL',315.14)) AS v(sku,c) WHERE p.sku=v.sku;
UPDATE public.products p SET cost_price=v.c, cost_price_inherited=false, cost_price_source='inkopshistorik', updated_at=now() FROM (VALUES ('FS-018',58.0),('FS-018-HEL-DK',70.0),('FS-023',127.0),('FS-023-HEL-SE',127.0),('FS-026',132.0),('FS-031',250.0),('FS-031-HEL-SE',72.0),('FS-031-STJ',225.64),('FS-033',80.0),('FS-033-HEL-SE',74.22),('FS-034',41.0),('FS-034-HEL-SE',32.82),('FS-040',60.0),('FS-040-HEL-SE',66.0),('FS-047-HEL-SE',76.0),('HAVS-001-R-L',465.0),('HAVS-001-R-S',207.28),('HAVS-001-STJ-B',147.54),('KOL-001',78.0),('KOL-001-HEL-SE',65.27),('LAX-001-SIDA-MSK',169.0),('SK-002',434.05)) AS v(sku,c) WHERE p.sku=v.sku;
UPDATE public.products p SET cost_price=v.c, cost_price_inherited=true, cost_price_source='inkopshistorik', updated_at=now() FROM (VALUES ('FS-007',300.0),('FS-007-R-L',300.0),('FS-007-R-M',300.0),('FS-007-R-S',300.0),('FS-007-R-XL',300.0),('FS-018-FIL-BAS',61.11),('FS-018-FIL-LYX',61.11),('FS-018-FIL-PRE',61.11),('FS-018-HEL-1',61.11),('FS-018-HEL-2',61.11),('FS-018-HEL-3',61.11),('FS-018-HEL-4',61.11),('FS-018-HEL-5',61.11),('FS-018-HEL-SE',61.11),('FS-018-RYG',61.11),('FS-019',169.0),('FS-023-FIL-BAS',127.0),('FS-023-FIL-LYX',127.0),('FS-023-FIL-PRE',127.0),('FS-023-HEL-1',127.0),('FS-023-HEL-2',127.0),('FS-023-HEL-3',127.0),('FS-023-HEL-DK',127.0),('FS-026-FIL-BAS',132.0),('FS-026-FIL-LYX',132.0),('FS-026-FIL-MSK',132.0),('FS-026-FIL-PRE',132.0),('FS-026-HEL-DK',132.0),('FS-026-HEL-SE',132.0),('FS-031-FIL-BAS',189.63),('FS-031-FIL-LYX',189.63),('FS-031-FIL-PRE',189.63),('FS-031-HEL-1',189.63),('FS-031-HEL-2',189.63),('FS-031-HEL-3',189.63),('FS-031-HEL-4',189.63),('FS-031-HEL-5',189.63),('FS-031-HEL-DK',189.63),('FS-031-KIN',189.63),('FS-031-LEV',189.63),('FS-033-FIL-BAS',76.13),('FS-033-FIL-LYX',76.13),('FS-033-FIL-PRE',76.13),('FS-033-HEL-1',76.13),('FS-033-HEL-2',76.13),('FS-033-HEL-3',76.13),('FS-033-HEL-4',76.13),('FS-033-HEL-DK',76.13),('FS-034-FIL-BAS',35.86),('FS-034-FIL-LYX',35.86),('FS-034-FIL-PRE',35.86),('FS-034-HEL-1',35.86),('FS-034-HEL-2',35.86),('FS-034-HEL-3',35.86),('FS-034-HEL-4',35.86),('FS-034-HEL-DK',35.86),('FS-034-RYG',35.86),('FS-040-FIL-BAS',61.81),('FS-040-FIL-LYX',61.81),('FS-040-FIL-PRE',61.81),('FS-040-HEL-1',61.81),('FS-040-HEL-2',61.81),('FS-040-HEL-3',61.81),('FS-040-HEL-DK',61.81),('FS-040-HUV',61.81),('FS-040-RYG',61.81),('FS-047',76.0),('FS-047-FIL-BAS',76.0),('FS-047-FIL-LYX',76.0),('FS-047-FIL-PRE',76.0),('FS-047-HEL-DK',76.0),('HAVS-001',252.12),('HAVS-001-R-M',252.12),('HAVS-001-R-XL',252.12),('KOL-001-FIL-BAS',69.76),('KOL-001-FIL-LYX',69.76),('KOL-001-FIL-PRE',69.76),('KOL-001-HEL-1',69.76),('KOL-001-HEL-2',69.76),('KOL-001-HEL-3',69.76),('KOL-001-HEL-4',69.76),('KOL-001-HEL-DK',69.76),('KOL-001-RYG',69.76),('LAX-001-BEN',169.0),('LAX-001-FIL-BAS',169.0),('LAX-001-FIL-LYX',169.0),('LAX-001-FIL-MSK',169.0),('LAX-001-FIL-PRE',169.0),('LAX-001-FRS',169.0),('LAX-001-GRY',169.0),('LAX-001-HEL',169.0),('LAX-001-HUV',169.0),('LAX-001-KOT',169.0),('LAX-001-PORT',169.0),('LAX-001-PORT-MSK',169.0),('LAX-001-SASHI',169.0),('LAX-001-SIDA',169.0),('LAX-001-TAR',169.0),('LAX-002',169.0),('TOR-001-KIN',158.75),('TOR-001-LEV',158.75),('TOR-001-ROM',158.75),('TOR-001-SLA',158.75),('TOR-001-STJ',158.75),('TOR-001-TUN',158.75)) AS v(sku,c) WHERE p.sku=v.sku;
UPDATE public.products p SET cost_price=v.c, cost_price_inherited=false, cost_price_source='utpris', updated_at=now() FROM (VALUES ('FS-020-HEL',389.0),('FS-020-SKI',68.0),('FS-025-FIL-BAS',302.48),('FS-025-FIL-LYX',302.48),('FS-025-FIL-PRE',302.48),('FS-025-HEL-DK',302.48),('FS-025-HEL-SE',302.48),('KK-002',365.0),('KK-008',87.7),('KRB-001',630.8),('KRB-002',411.96),('PLT-001-FIL-BAS',83.68),('PLT-001-FIL-LYX',83.68),('PLT-001-FIL-PRE',83.68),('PLT-001-HEL-DK',83.68),('PLT-001-HEL-SE',83.68),('VK-009-VB',189.0)) AS v(sku,c) WHERE p.sku=v.sku;
UPDATE public.products SET cost_price_source='platshallare', updated_at=now() WHERE cost_price=1 AND cost_price_source IS NULL;
CREATE OR REPLACE FUNCTION public.propagate_inherited_cost_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price
     AND coalesce(current_setting('app.propagate_cost', true), '') <> '1' THEN
    PERFORM set_config('app.propagate_cost', '1', true);
    UPDATE public.products SET cost_price = NEW.cost_price, updated_at = now()
    WHERE parent_product_id = NEW.id AND cost_price_inherited = true;
    PERFORM set_config('app.propagate_cost', '', true);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_propagate_inherited_cost_price ON public.products;
CREATE TRIGGER trg_propagate_inherited_cost_price AFTER UPDATE OF cost_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.propagate_inherited_cost_price();
CREATE OR REPLACE FUNCTION public.clear_inherited_cost_price()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price
     AND NEW.cost_price_inherited = OLD.cost_price_inherited
     AND coalesce(current_setting('app.propagate_cost', true), '') <> '1' THEN
    NEW.cost_price_inherited := false;
  END IF;
  RETURN NEW;
END; $$;