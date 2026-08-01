ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS parent_location_id uuid REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_storage_locations_parent ON public.storage_locations(parent_location_id);

-- Skapa Försäljningslager för varje aktiv butik
INSERT INTO public.storage_locations (name, store_id, zone, description)
SELECT 'Försäljningslager', s.id, 'Försäljning', 'Allt som ligger ute i försäljning. Uppdateras dagligen.'
FROM public.stores s
WHERE s.active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.storage_locations sl
    WHERE sl.store_id = s.id AND sl.name = 'Försäljningslager'
  );

-- Skapa sublager per produktkategori under varje Försäljningslager
INSERT INTO public.storage_locations (name, store_id, zone, description, parent_location_id, category)
SELECT c.category || '-lager', fl.store_id, 'Försäljning', 'Sublager för ' || c.category, fl.id, c.category
FROM public.storage_locations fl
CROSS JOIN (
  SELECT DISTINCT category FROM public.products WHERE active = true AND category IS NOT NULL
) c
WHERE fl.name = 'Försäljningslager'
  AND fl.parent_location_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.storage_locations sub
    WHERE sub.parent_location_id = fl.id AND sub.category = c.category
  );