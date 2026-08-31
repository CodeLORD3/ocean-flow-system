ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS weather_timezone text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.store_weather_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weather_date date NOT NULL,
  temp_max numeric,
  temp_min numeric,
  precipitation_mm numeric,
  windspeed_max numeric,
  weather_code integer,
  weather_text text,
  source text NOT NULL DEFAULT 'forecast',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_weather_daily_store_date_idx
  ON public.store_weather_daily (store_id, weather_date);

GRANT SELECT ON public.store_weather_daily TO authenticated;
GRANT ALL ON public.store_weather_daily TO service_role;

ALTER TABLE public.store_weather_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read store weather"
  ON public.store_weather_daily
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'));