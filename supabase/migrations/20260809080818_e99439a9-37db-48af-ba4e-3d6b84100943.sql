DO $$
DECLARE
  g uuid;
BEGIN
  SELECT id INTO g FROM public.stores WHERE name = 'Grossist Göteborg' LIMIT 1;
  IF g IS NULL THEN RAISE EXCEPTION 'Grossist Göteborg saknas'; END IF;

  -- Ett gemensamt grossistlager, ägt av grossistenheten
  UPDATE public.storage_locations
     SET store_id = g, name = 'Grossistlager'
   WHERE id = '5da57ad6-f72c-4a84-9873-87174d194e10';

  -- Bara grossistens inköps- och produktionslager blir kvar
  UPDATE public.storage_locations
     SET active = false
   WHERE active
     AND location_type IN ('inkopslager','tillverkningslager')
     AND store_id IS DISTINCT FROM g;

  UPDATE public.storage_locations SET name = 'Inköpslager'
   WHERE active AND location_type = 'inkopslager' AND store_id = g;

  UPDATE public.storage_locations SET name = 'Produktionslager'
   WHERE active AND location_type = 'tillverkningslager' AND store_id = g;

  -- Transportlager per butik; grossistens eget transportlager används inte
  UPDATE public.storage_locations SET active = false
   WHERE active AND location_type = 'leveranslager' AND store_id = g;

  UPDATE public.storage_locations l
     SET name = 'Transportlager ' || s.name
    FROM public.stores s
   WHERE s.id = l.store_id AND l.active AND l.location_type = 'leveranslager';
END $$;