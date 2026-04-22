DO $$
DECLARE
  kungsholmen_id uuid := 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7';
  alsten_id      uuid := '0f8691d1-1fde-4b0f-8f26-31cc9d59619f';
  stockholm_id   uuid := 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7'; -- reuse Kungsholmen row
  pre_id         uuid := gen_random_uuid();
  raw_id         uuid := gen_random_uuid();
  alsten_loc_id  uuid := gen_random_uuid();
  kungs_loc_id   uuid := gen_random_uuid();
  old_loc        record;
BEGIN
  -- 1. Rename Kungsholmen → Stockholm (keeps history)
  UPDATE public.stores
     SET name = 'Stockholm', city = 'Stockholm'
   WHERE id = stockholm_id;

  -- 2. Re-point all Ålsten data to Stockholm
  UPDATE public.shop_orders                SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.shop_wishes                SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.shop_reports               SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.customers                  SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.delivery_notes             SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.delivery_receiving_reports SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.meeting_protocols          SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.schedule_events            SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.notifications              SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.activity_logs              SET store_id = stockholm_id WHERE store_id = alsten_id;
  UPDATE public.inventory_reports          SET store_id = stockholm_id WHERE store_id = alsten_id;

  -- 3. Create the four new storage_locations for Stockholm
  INSERT INTO public.storage_locations (id, name, zone, store_id, description) VALUES
    (pre_id,        'Pre-Stockholm',     'Transit',  stockholm_id, 'Packat och på väg till Stockholm'),
    (raw_id,        'Raw-Stockholm',     'Kyl',      stockholm_id, 'Mottaget vid ankomst Stockholm – delas av Ålsten och Kungsholmen'),
    (alsten_loc_id, 'Ålsten Lager',     'Butik',    stockholm_id, 'Lager för Ålsten butik'),
    (kungs_loc_id,  'Kungsholmen Lager', 'Butik',    stockholm_id, 'Lager för Kungsholmen butik');

  -- 4. Move existing stock from old locations into Raw-Stockholm
  --    (consolidates everything; staff redistributes manually via stock-transfer)
  FOR old_loc IN
    SELECT id FROM public.storage_locations
     WHERE store_id IN (kungsholmen_id, alsten_id)
       AND id NOT IN (pre_id, raw_id, alsten_loc_id, kungs_loc_id)
  LOOP
    UPDATE public.product_stock_locations
       SET location_id = raw_id
     WHERE location_id = old_loc.id;

    UPDATE public.deleted_stock_log
       SET location_id = raw_id
     WHERE location_id = old_loc.id;

    UPDATE public.inventory_reports
       SET location_id = raw_id
     WHERE location_id = old_loc.id;

    DELETE FROM public.storage_locations WHERE id = old_loc.id;
  END LOOP;

  -- 5. Update staff with old store references
  UPDATE public.staff
     SET allowed_store_id = stockholm_id
   WHERE allowed_store_id = alsten_id;

  UPDATE public.staff
     SET store_id = stockholm_id
   WHERE store_id = alsten_id;

  -- Vilma & anyone with both Kungsholmen+Ålsten in allowed_store_ids → just Stockholm
  UPDATE public.staff
     SET allowed_store_ids = ARRAY[stockholm_id]::uuid[]
   WHERE alsten_id = ANY(allowed_store_ids) OR kungsholmen_id = ANY(allowed_store_ids);

  -- 6. Remove the old Ålsten store row
  DELETE FROM public.stores WHERE id = alsten_id;
END $$;