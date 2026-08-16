-- Traceability columns
ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS created_by_user uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Actor stamping trigger
CREATE OR REPLACE FUNCTION public.stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  col text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'shop_orders' THEN
      NEW.created_by_user := uid;
    ELSE
      NEW.created_by := uid;
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.updated_by := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: created_* is immutable
  IF TG_TABLE_NAME = 'shop_orders' THEN
    NEW.created_by_user := OLD.created_by_user;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(uid, OLD.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_actor_shop_orders ON public.shop_orders;
CREATE TRIGGER stamp_actor_shop_orders
  BEFORE INSERT OR UPDATE ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

DROP TRIGGER IF EXISTS stamp_actor_customer_orders ON public.customer_orders;
CREATE TRIGGER stamp_actor_customer_orders
  BEFORE INSERT OR UPDATE ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

-- Name lookup (names only, no sensitive staff data)
CREATE OR REPLACE VIEW public.actor_names AS
SELECT s.user_id,
       NULLIF(TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '') AS display_name
FROM public.staff s
WHERE s.user_id IS NOT NULL;

GRANT SELECT ON public.actor_names TO authenticated;