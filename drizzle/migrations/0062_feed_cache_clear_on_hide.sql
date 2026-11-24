CREATE OR REPLACE FUNCTION public.feed_cache_clear() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.feed_partners SET cache_json = NULL, cache_byggd = NULL WHERE cache_json IS NOT NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER products_feed_cache_clear AFTER UPDATE OF dold_i_partnerfeed ON public.products
FOR EACH ROW WHEN (OLD.dold_i_partnerfeed IS DISTINCT FROM NEW.dold_i_partnerfeed)
EXECUTE FUNCTION public.feed_cache_clear();