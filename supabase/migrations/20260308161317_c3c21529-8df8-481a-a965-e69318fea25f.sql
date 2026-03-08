
-- Drop unique constraint on zone_key to allow multiple departure days per zone
ALTER TABLE public.transport_schedules DROP CONSTRAINT transport_schedules_zone_key_key;

-- Add unique constraint on (zone_key, departure_weekday) instead
CREATE UNIQUE INDEX transport_schedules_zone_weekday_key ON public.transport_schedules (zone_key, departure_weekday);
