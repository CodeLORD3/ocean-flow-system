-- 1) Kanonisk artnyckel i databasen, speglar speciesKey() i appen
CREATE OR REPLACE FUNCTION public.species_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    lower(btrim(translate(v, 'ÅÄÖåäöØøŒœÉéÜü', 'AAOaaoOoOoEeUu'))),
    ''
  )
$$;

-- 2) Normaliserande trigger
CREATE OR REPLACE FUNCTION public.normalize_species_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.species_group := public.species_key(NEW.species_group);
  RETURN NEW;
END;
$$;

-- 3) Normalisera befintliga rader + sätt trigger på varje tabell med species_group
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','species_cut_models','yields','cut_splits','detail_prices',
    'byproduct_prices','yield_actuals','production_orders','auction_calcs'
  ] LOOP
    EXECUTE format(
      'UPDATE public.%I SET species_group = public.species_key(species_group)
         WHERE species_group IS DISTINCT FROM public.species_key(species_group)', t);
    EXECUTE format('DROP TRIGGER IF EXISTS normalize_species_group_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER normalize_species_group_trg
         BEFORE INSERT OR UPDATE OF species_group ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.normalize_species_group()', t);
  END LOOP;
END $$;

-- 4) Utpekad inventeringsplats per butik (ersätter namnmatchning i veckorapporten)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS inventory_location_id uuid
  REFERENCES public.storage_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stores.inventory_location_id IS
  'Lagerplats som veckorapportens inventering bokförs mot. Sätts vid uppsättning, förvalt Försäljningslager.';

UPDATE public.stores s
SET inventory_location_id = l.id
FROM public.storage_locations l
WHERE l.store_id = s.id
  AND s.inventory_location_id IS NULL
  AND public.species_key(l.name) = 'forsaljningslager';