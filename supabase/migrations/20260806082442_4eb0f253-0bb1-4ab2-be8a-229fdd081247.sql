CREATE TABLE public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  clocked_in_at timestamptz NOT NULL DEFAULT now(),
  clocked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage staff shifts"
  ON public.staff_shifts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_staff_shifts_open ON public.staff_shifts (staff_id) WHERE clocked_out_at IS NULL;
CREATE INDEX idx_staff_shifts_store ON public.staff_shifts (store_id, clocked_in_at DESC);

CREATE TRIGGER staff_shifts_set_updated_at
  BEFORE UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();