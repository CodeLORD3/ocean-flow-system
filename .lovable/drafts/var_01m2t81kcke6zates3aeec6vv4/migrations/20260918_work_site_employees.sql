-- Kostnadsställen som bara ett fåtal personer får stämpla på (t.ex. Administration).
-- Finns ingen rad för ett kostnadsställe är det öppet för alla, precis som tidigare.
CREATE TABLE IF NOT EXISTS public.work_site_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_site_id uuid NOT NULL REFERENCES public.work_sites(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_site_id, employee_id)
);

GRANT SELECT ON public.work_site_employees TO authenticated;
GRANT ALL ON public.work_site_employees TO service_role;

ALTER TABLE public.work_site_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan läsa kopplingar"
  ON public.work_site_employees FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Admin kan hantera kopplingar"
  ON public.work_site_employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Administration (3020) gäller bara för kontorspersonalen.
INSERT INTO public.work_site_employees (work_site_id, employee_id)
SELECT ws.id, e.id
FROM public.work_sites ws
CROSS JOIN public.employees e
WHERE ws.name = 'Administration'
  AND e.id IN (
    '7060cb0d-c2bf-4b88-b531-0631d640ff5c', -- Baldvin Ahlander
    '17800be7-ee8c-4e22-a6c9-b615c39d1e3a', -- Fredric Lindqvist
    'a107c624-f8e3-48ad-b632-9f5b4e0653ed', -- Tim Hvarfvenius
    '0ced8b7e-844a-4db7-add1-9b306f4c4185'  -- Joakim Hvarfvenius
  )
ON CONFLICT DO NOTHING;

-- Caisa Carning (De No.1 AB) får också stämpla på Administration.
INSERT INTO public.work_site_employees (work_site_id, employee_id)
SELECT ws.id, e.id
FROM public.work_sites ws
CROSS JOIN public.employees e
WHERE ws.name = 'Administration'
  AND e.email = 'caisacarning@gmail.com'
ON CONFLICT DO NOTHING;
