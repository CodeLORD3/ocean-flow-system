-- Normalisera Stockholms Raw-lager till samma namn som övriga
UPDATE public.storage_locations SET name = 'Raw Lager', zone = 'Kyl'
WHERE name = 'Raw-Stockholm';

-- Ge alla butiker samma uppsättning lager som Amhult
INSERT INTO public.storage_locations (name, store_id, zone)
SELECT t.name, s.id, t.zone
FROM public.stores s
CROSS JOIN (VALUES
  ('Försäljningslager', 'Försäljning'),
  ('Raw Lager', 'Kyl'),
  ('Kyllager', 'Kyl'),
  ('Kylrum 1', 'Kyl'),
  ('Fryslager', 'Frys'),
  ('Frysrum', 'Frys'),
  ('Grossist Flytande', 'Kyl')
) AS t(name, zone)
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_locations l
  WHERE l.store_id = s.id AND l.name = t.name
);

-- Pre-lager (transit) för butiker som saknar ett
INSERT INTO public.storage_locations (name, store_id, zone)
SELECT 'Pre-' || s.name, s.id, 'Transit'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_locations l
  WHERE l.store_id = s.id AND l.zone = 'Transit'
);