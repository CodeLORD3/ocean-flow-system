
CREATE TABLE public.transport_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_key text NOT NULL UNIQUE,
  label text NOT NULL,
  departure_days_before integer NOT NULL DEFAULT 0,
  departure_time text NOT NULL DEFAULT '06:00',
  badge_color text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.transport_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.transport_schedules FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.transport_schedules (zone_key, label, departure_days_before, departure_time, badge_color) VALUES
  ('international', 'Internationell', 2, '06:00', 'destructive'),
  ('stockholm', 'Stockholm', 1, '06:00', 'default'),
  ('gothenburg', 'Göteborg', 0, '09:00', 'secondary');
