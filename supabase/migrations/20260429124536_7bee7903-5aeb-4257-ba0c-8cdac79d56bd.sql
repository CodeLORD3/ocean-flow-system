CREATE TABLE IF NOT EXISTS public.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_number text NOT NULL DEFAULT '',
  make text,
  status text,
  model_year integer,
  finance text,
  fault text,
  comment text,
  next_service date,
  last_serviced date,
  odometer text,
  odometer_updated_at date,
  cooling_service text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machine_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  col_type text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "machines_all_select" ON public.machines FOR SELECT USING (true);
CREATE POLICY "machines_all_insert" ON public.machines FOR INSERT WITH CHECK (true);
CREATE POLICY "machines_all_update" ON public.machines FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "machines_all_delete" ON public.machines FOR DELETE USING (true);

CREATE POLICY "machine_columns_all_select" ON public.machine_columns FOR SELECT USING (true);
CREATE POLICY "machine_columns_all_insert" ON public.machine_columns FOR INSERT WITH CHECK (true);
CREATE POLICY "machine_columns_all_update" ON public.machine_columns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "machine_columns_all_delete" ON public.machine_columns FOR DELETE USING (true);

CREATE TRIGGER machines_set_updated_at
BEFORE UPDATE ON public.machines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();