
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_number text NOT NULL,
  make text,
  status text,
  model_year integer,
  finance text,
  fault text,
  comment text,
  next_service text,
  odometer text,
  cooling_service text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.vehicle_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  col_type text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.vehicle_columns FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.vehicles (reg_number, make, status, model_year, finance, sort_order) VALUES
  ('DKB76C', 'MERCEDES', 'UNDERHÅLL KRÄVS', 2021, 'Finans FOS', 1),
  ('YKK01J', 'RENAULT', 'UNDERHÅLL KRÄVS', 2021, 'Finans FOS', 2),
  ('YXM83A', 'FIAT', 'UNDERHÅLL KRÄVS', 2019, 'ÄGD', 3),
  ('ZKB004', 'IVECO', 'UNDERHÅLL KRÄVS', 2018, 'ÄGD', 4),
  ('DWF13W', 'MERCEDES', 'TRASIG', 2023, 'Finans Deno1', 5),
  ('CPF526', 'PEUGOT - FISKVAGN', 'UNDERHÅLL KRÄVS', 2011, 'ÄGD', 6);
