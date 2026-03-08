
ALTER TABLE public.transport_schedules ADD COLUMN departure_weekday integer;
UPDATE public.transport_schedules SET departure_weekday = CASE 
  WHEN zone_key = 'international' THEN 1 
  WHEN zone_key = 'stockholm' THEN 3 
  WHEN zone_key = 'gothenburg' THEN 4 
END;
ALTER TABLE public.transport_schedules ALTER COLUMN departure_weekday SET NOT NULL;
ALTER TABLE public.transport_schedules ALTER COLUMN departure_weekday SET DEFAULT 1;
COMMENT ON COLUMN public.transport_schedules.departure_weekday IS '1=Monday, 2=Tuesday, ... 7=Sunday';
