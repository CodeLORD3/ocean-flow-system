ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price_inherited boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.clear_inherited_cost_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price AND NEW.cost_price_inherited = OLD.cost_price_inherited THEN
    NEW.cost_price_inherited := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_inherited_cost_price ON public.products;
CREATE TRIGGER trg_clear_inherited_cost_price
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.clear_inherited_cost_price();