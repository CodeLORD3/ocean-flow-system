ALTER TABLE public.product_stock_locations
  ADD COLUMN IF NOT EXISTS in_count_list boolean NOT NULL DEFAULT false;

-- När en vara räknas på en lagerplats läggs den in i platsens räknelista,
-- som tom platshållare (saldo skrivs fortfarande bara via stock_movements).
CREATE OR REPLACE FUNCTION public.register_counted_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NULL OR NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.product_stock_locations (product_id, location_id, in_count_list, updated_at)
  VALUES (NEW.product_id, NEW.location_id, true, now())
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET in_count_list = true
  WHERE product_stock_locations.in_count_list = false;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_counted_product() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stock_count_lines_register ON public.stock_count_lines;
CREATE TRIGGER trg_stock_count_lines_register
AFTER INSERT ON public.stock_count_lines
FOR EACH ROW EXECUTE FUNCTION public.register_counted_product();

-- Tidigare räknade varor hamnar i listan direkt.
INSERT INTO public.product_stock_locations (product_id, location_id, in_count_list, updated_at)
SELECT DISTINCT l.product_id, l.location_id, true, now()
FROM public.stock_count_lines l
WHERE l.product_id IS NOT NULL AND l.location_id IS NOT NULL
ON CONFLICT (product_id, location_id) DO UPDATE SET in_count_list = true;