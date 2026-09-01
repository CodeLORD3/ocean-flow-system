CREATE OR REPLACE FUNCTION public.image_feed_store_labels()
RETURNS TABLE(id uuid, name text, city text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city
  FROM public.stores s
  WHERE public.is_staff();
$$;

REVOKE ALL ON FUNCTION public.image_feed_store_labels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.image_feed_store_labels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.image_feed_store_labels() TO service_role;