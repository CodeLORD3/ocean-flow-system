CREATE OR REPLACE FUNCTION public.stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  actor uuid;
BEGIN
  IF TG_TABLE_NAME = 'customer_orders' THEN
    -- created_by pekar på staff(id), inte auth.users
    SELECT s.id INTO actor FROM public.staff s WHERE s.user_id = uid LIMIT 1;
  ELSE
    actor := uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'shop_orders' THEN
      NEW.created_by_user := actor;
    ELSE
      NEW.created_by := actor;
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.updated_by := NULL;
    RETURN NEW;
  END IF;

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