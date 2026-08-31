-- 0c: härledda frånvarodagar
CREATE TABLE IF NOT EXISTS public.absence_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.absence_requests(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  extent_pct NUMERIC NOT NULL DEFAULT 100,
  shift_id UUID,
  hours NUMERIC,
  is_overridden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_days TO authenticated;
GRANT ALL ON public.absence_days TO service_role;

ALTER TABLE public.absence_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absence_days_select" ON public.absence_days
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "absence_days_write_admin" ON public.absence_days
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS absence_days_employee_date_idx ON public.absence_days (employee_id, date);

CREATE TRIGGER absence_days_updated_at
  BEFORE UPDATE ON public.absence_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- generera dagrader ur perioden
CREATE OR REPLACE FUNCTION public.absence_generate_days(_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  d DATE;
  n INTEGER := 0;
  s RECORD;
BEGIN
  SELECT * INTO r FROM public.absence_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.absence_days
   WHERE request_id = _request_id AND is_overridden = false;

  d := r.start_date;
  WHILE d <= r.end_date LOOP
    SELECT sh.id AS shift_id,
           EXTRACT(EPOCH FROM (sh.end_at - sh.start_at)) / 3600.0 AS shift_hours
      INTO s
      FROM public.shifts sh
     WHERE sh.employee_id = r.employee_id
       AND (sh.start_at AT TIME ZONE 'Europe/Stockholm')::date = d
     ORDER BY sh.start_at
     LIMIT 1;

    INSERT INTO public.absence_days (request_id, employee_id, date, extent_pct, shift_id, hours)
    VALUES (
      _request_id, r.employee_id, d,
      COALESCE(r.extent_pct, 100),
      s.shift_id,
      CASE WHEN s.shift_hours IS NOT NULL
           THEN ROUND(s.shift_hours * COALESCE(r.extent_pct, 100) / 100.0, 2)
           ELSE NULL END
    )
    ON CONFLICT (request_id, date) DO NOTHING;
    n := n + 1;
    d := d + 1;
  END LOOP;

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.absence_requests_sync_days()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.absence_generate_days(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absence_requests_sync_days_trg ON public.absence_requests;
CREATE TRIGGER absence_requests_sync_days_trg
  AFTER INSERT OR UPDATE OF start_date, end_date, extent_pct, employee_id
  ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.absence_requests_sync_days();

-- 0d: lönens tid per dag
ALTER TABLE public.attestations
  ADD COLUMN IF NOT EXISTS payroll_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payroll_out TIMESTAMPTZ;

-- F1: tvångsupplåsning av låst löneperiod
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID,
  ADD COLUMN IF NOT EXISTS forced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forced_reason TEXT,
  ADD COLUMN IF NOT EXISTS forced_by UUID,
  ADD COLUMN IF NOT EXISTS forced_at TIMESTAMPTZ;

-- F2: preliminär månadskostnad per enhet
CREATE OR REPLACE FUNCTION public.preliminar_manadskostnad(_store_id UUID, _month DATE)
RETURNS TABLE (
  store_id UUID,
  month DATE,
  minutes INTEGER,
  lonekostnad NUMERIC,
  arbetsgivaravgift NUMERIC,
  total NUMERIC,
  ar_preliminar BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_d DATE := date_trunc('month', _month)::date;
  end_d DATE := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH rader AS (
    SELECT a.employee_id,
           COALESCE(a.approved_minutes, (a.computed->>'minutes')::int, 0) AS min,
           e.hourly_rate,
           e.birth_year
      FROM public.attestations a
      JOIN (
        SELECT em.id,
               NULLIF((em.meta->>'hourly_rate'), '')::numeric AS hourly_rate,
               NULLIF((em.meta->>'birth_year'), '')::int AS birth_year
          FROM public.employees em
      ) e ON e.id = a.employee_id
     WHERE a.store_id = _store_id
       AND a.date BETWEEN start_d AND end_d
  )
  SELECT _store_id,
         start_d,
         COALESCE(SUM(min), 0)::int,
         ROUND(COALESCE(SUM(min * COALESCE(hourly_rate, 0) / 60.0), 0), 2),
         ROUND(COALESCE(SUM(
           min * COALESCE(hourly_rate, 0) / 60.0 *
           CASE
             WHEN birth_year IS NULL THEN 0.3142
             WHEN (EXTRACT(YEAR FROM start_d) - birth_year) BETWEEN 15 AND 18 THEN 0.0
             WHEN (EXTRACT(YEAR FROM start_d) - birth_year) < 23 THEN 0.1949
             ELSE 0.3142
           END), 0), 2),
         ROUND(COALESCE(SUM(
           min * COALESCE(hourly_rate, 0) / 60.0 * (1 +
           CASE
             WHEN birth_year IS NULL THEN 0.3142
             WHEN (EXTRACT(YEAR FROM start_d) - birth_year) BETWEEN 15 AND 18 THEN 0.0
             WHEN (EXTRACT(YEAR FROM start_d) - birth_year) < 23 THEN 0.1949
             ELSE 0.3142
           END)), 0), 2),
         true
    FROM rader;
END;
$$;