CREATE TABLE public.employment_wages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_id uuid NOT NULL REFERENCES public.employments(id) ON DELETE CASCADE,
  first_day date NOT NULL,
  pay_type text NOT NULL CHECK (pay_type IN ('monthly', 'hourly')),
  monthly_salary numeric,
  hourly_rate numeric,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employment_id, first_day),
  CHECK ((pay_type = 'monthly' AND monthly_salary IS NOT NULL) OR (pay_type = 'hourly' AND hourly_rate IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_wages TO authenticated;
GRANT ALL ON public.employment_wages TO service_role;
ALTER TABLE public.employment_wages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employment wages readable like employment" ON public.employment_wages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employments e WHERE e.id = employment_id AND public.can_see_employee(e.employee_id)));
CREATE POLICY "Managers manage employment wages" ON public.employment_wages
  FOR ALL TO authenticated
  USING (public.is_staff_manager() AND EXISTS (SELECT 1 FROM public.employments e WHERE e.id = employment_id AND (e.legal_entity_id IS NULL OR public.can_see_company(e.legal_entity_id))))
  WITH CHECK (public.is_staff_manager() AND EXISTS (SELECT 1 FROM public.employments e WHERE e.id = employment_id AND (e.legal_entity_id IS NULL OR public.can_see_company(e.legal_entity_id))));
CREATE INDEX employment_wages_employment_idx ON public.employment_wages (employment_id, first_day);
CREATE TRIGGER employment_wages_updated_at BEFORE UPDATE ON public.employment_wages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();