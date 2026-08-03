-- AP-2: products.stock blir härlett ur lagerplatssaldona.
CREATE OR REPLACE FUNCTION public.sync_product_stock_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected uuid;
BEGIN
  affected := COALESCE(NEW.product_id, OLD.product_id);
  IF affected IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.products p
     SET stock = COALESCE((
           SELECT SUM(psl.quantity)
             FROM public.product_stock_locations psl
            WHERE psl.product_id = affected
         ), 0),
         updated_at = now()
   WHERE p.id = affected;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_product_stock_total_trg ON public.product_stock_locations;
CREATE TRIGGER sync_product_stock_total_trg
AFTER INSERT OR UPDATE OR DELETE ON public.product_stock_locations
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_total();

-- Engångsomräkning: nollställ produkter utan lagerplatsrader, summera övriga.
UPDATE public.products p
   SET stock = COALESCE((
         SELECT SUM(psl.quantity)
           FROM public.product_stock_locations psl
          WHERE psl.product_id = p.id
       ), 0);