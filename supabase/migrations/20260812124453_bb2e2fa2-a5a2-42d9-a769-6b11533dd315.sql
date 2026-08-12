ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS monthly_salary numeric;

CREATE TABLE IF NOT EXISTS public.staff_salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  employment_type text NOT NULL DEFAULT 'hourly',
  hourly_rate numeric,
  monthly_salary numeric,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_salary_history_staff_date_idx
  ON public.staff_salary_history (staff_id, valid_from);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_salary_history TO authenticated;
GRANT ALL ON public.staff_salary_history TO service_role;

ALTER TABLE public.staff_salary_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read salary history"
  ON public.staff_salary_history FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Managers manage salary history"
  ON public.staff_salary_history FOR ALL TO authenticated
  USING (public.is_staff_manager() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_staff_manager() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER staff_salary_history_updated_at
  BEFORE UPDATE ON public.staff_salary_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.staff_salary_history (staff_id, employment_type, hourly_rate, valid_from, note)
SELECT id, 'hourly', hourly_rate, COALESCE(created_at::date, CURRENT_DATE), 'Migrerad från befintlig timlön'
FROM public.staff
WHERE hourly_rate IS NOT NULL
ON CONFLICT DO NOTHING;