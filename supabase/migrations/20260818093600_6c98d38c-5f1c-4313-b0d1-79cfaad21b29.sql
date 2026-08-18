-- 1. Anslutningar
CREATE TABLE public.pk_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  secret_name text NOT NULL UNIQUE,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Läsbehörighet: admin / plattformsadmin / bolagsadmin
CREATE OR REPLACE FUNCTION public.pk_can_read()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'platform_admin')
      OR public.has_role(auth.uid(), 'company_admin')
$$;

CREATE OR REPLACE FUNCTION public.pk_can_read_salary()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'platform_admin')
$$;

-- 2. Arbetsplatser
CREATE TABLE public.pk_workplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  url text NOT NULL,
  short_identifier integer,
  name text,
  company_url text,
  store_id uuid REFERENCES public.stores(id),
  store_id_manual boolean NOT NULL DEFAULT false,
  is_missing_since timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, url)
);

-- 3. Personal
CREATE TABLE public.pk_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  url text NOT NULL,
  pk_id integer,
  first_name text,
  last_name text,
  email text,
  mobile_phone text,
  employment_number text,
  pnr_masked text,
  pnr_encrypted text,
  confirmed boolean,
  group_url text,
  group_name text,
  registration_date date,
  workplace_url text,
  default_cost_group text,
  employee_id uuid REFERENCES public.staff(id),
  employee_id_manual boolean NOT NULL DEFAULT false,
  is_active_employment boolean NOT NULL DEFAULT false,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, url)
);
CREATE INDEX pk_staff_email_idx ON public.pk_staff (lower(email));
CREATE INDEX pk_staff_workplace_idx ON public.pk_staff (connection_id, workplace_url);

-- 4. Anställningar (löneuppgifter)
CREATE TABLE public.pk_staff_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  staff_url text NOT NULL,
  start date NOT NULL,
  "end" date,
  salary_type text,
  hourly_salary numeric,
  monthly_salary numeric,
  fixed_cost_per_day numeric,
  service_grade numeric,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, staff_url, start)
);

-- 5. Schemalagda pass
CREATE TABLE public.pk_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  url text NOT NULL,
  period_url text,
  staff_url text,
  staff_name text,
  workplace_url text,
  costgroup_url text,
  costgroup_name text,
  date date,
  start timestamptz,
  "end" timestamptz,
  start_time time,
  end_time time,
  period_name text,
  period_color text,
  description text,
  estimated_cost numeric,
  additional_salaries jsonb,
  breaks jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  raw jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, url)
);
CREATE INDEX pk_work_periods_date_idx ON public.pk_work_periods (date, workplace_url);

-- 6. Stämplade tider
CREATE TABLE public.pk_logged_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  url text NOT NULL,
  identifier uuid,
  staff_url text,
  workplace_url text,
  work_period_url text,
  company_url text,
  costgroup_url text,
  costgroup_name text,
  start timestamptz,
  stop timestamptz,
  real_start timestamptz,
  real_stop timestamptz,
  work_time_sec integer,
  breaks_duration_sec integer NOT NULL DEFAULT 0,
  breaks jsonb,
  cost numeric,
  estimated_salary numeric,
  shift_salary numeric,
  is_canceled boolean NOT NULL DEFAULT false,
  is_guest boolean NOT NULL DEFAULT false,
  guest_name text,
  guest_id_masked text,
  comment text,
  raw jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, url)
);
CREATE INDEX pk_logged_times_open_idx ON public.pk_logged_times (workplace_url) WHERE stop IS NULL;
CREATE INDEX pk_logged_times_start_idx ON public.pk_logged_times (start);

-- 7. Synkstatus och logg
CREATE TABLE public.pk_sync_state (
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  resource text NOT NULL,
  sync_cursor text,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  records_upserted integer NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, resource)
);

CREATE TABLE public.pk_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  resource text NOT NULL,
  pages integer NOT NULL DEFAULT 0,
  upserts integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pk_sync_log_created_idx ON public.pk_sync_log (created_at DESC);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pk_connections TO authenticated;
GRANT SELECT, UPDATE ON public.pk_workplaces TO authenticated;
GRANT SELECT, UPDATE ON public.pk_staff TO authenticated;
GRANT SELECT ON public.pk_staff_employments TO authenticated;
GRANT SELECT ON public.pk_work_periods TO authenticated;
GRANT SELECT ON public.pk_logged_times TO authenticated;
GRANT SELECT ON public.pk_sync_state TO authenticated;
GRANT SELECT ON public.pk_sync_log TO authenticated;
GRANT ALL ON public.pk_connections, public.pk_workplaces, public.pk_staff,
  public.pk_staff_employments, public.pk_work_periods, public.pk_logged_times,
  public.pk_sync_state, public.pk_sync_log TO service_role;

-- RLS
ALTER TABLE public.pk_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_staff_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_work_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_logged_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pk_connections_read" ON public.pk_connections FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_connections_write" ON public.pk_connections FOR ALL TO authenticated USING (public.pk_can_read_salary()) WITH CHECK (public.pk_can_read_salary());

CREATE POLICY "pk_workplaces_read" ON public.pk_workplaces FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_workplaces_map" ON public.pk_workplaces FOR UPDATE TO authenticated USING (public.pk_can_read_salary()) WITH CHECK (public.pk_can_read_salary());

CREATE POLICY "pk_staff_read" ON public.pk_staff FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_staff_map" ON public.pk_staff FOR UPDATE TO authenticated USING (public.pk_can_read_salary()) WITH CHECK (public.pk_can_read_salary());

CREATE POLICY "pk_employments_read" ON public.pk_staff_employments FOR SELECT TO authenticated USING (public.pk_can_read_salary());
CREATE POLICY "pk_work_periods_read" ON public.pk_work_periods FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_logged_times_read" ON public.pk_logged_times FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_sync_state_read" ON public.pk_sync_state FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_sync_log_read" ON public.pk_sync_log FOR SELECT TO authenticated USING (public.pk_can_read());

CREATE TRIGGER pk_connections_updated_at BEFORE UPDATE ON public.pk_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Vy: På plats nu
CREATE VIEW public.v_pk_clocked_in_now
WITH (security_invoker = true) AS
WITH today AS (SELECT (now() AT TIME ZONE 'Europe/Stockholm')::date AS d),
wp AS (
  SELECT p.connection_id, p.url AS work_period_url, p.staff_url, p.staff_name,
         p.workplace_url, p.costgroup_name, p.start, p."end", p.estimated_cost
  FROM public.pk_work_periods p, today t
  WHERE p.date = t.d AND p.is_published AND NOT p.is_deleted
),
lt AS (
  SELECT l.*
  FROM public.pk_logged_times l, today t
  WHERE NOT l.is_canceled
    AND (
      (l.start AT TIME ZONE 'Europe/Stockholm')::date = t.d
      OR (l.stop IS NULL AND l.start IS NOT NULL)
    )
),
joined AS (
  SELECT
    COALESCE(wp.connection_id, lt.connection_id) AS connection_id,
    COALESCE(wp.workplace_url, lt.workplace_url) AS workplace_url,
    COALESCE(wp.staff_url, lt.staff_url) AS staff_url,
    wp.work_period_url,
    lt.url AS logged_time_url,
    wp.start AS scheduled_start,
    wp."end" AS scheduled_end,
    wp.estimated_cost,
    lt.real_start, lt.real_stop, lt.stop, lt.start AS logged_start,
    lt.is_guest, lt.guest_name,
    COALESCE(lt.costgroup_name, wp.costgroup_name) AS costgroup_name,
    wp.staff_name
  FROM wp
  FULL OUTER JOIN lt
    ON lt.connection_id = wp.connection_id
   AND (
     lt.work_period_url = wp.work_period_url
     OR (lt.work_period_url IS NULL AND lt.staff_url = wp.staff_url AND lt.workplace_url = wp.workplace_url)
   )
)
SELECT
  j.connection_id,
  w.store_id,
  s.name AS store_name,
  j.workplace_url,
  w.name AS workplace_name,
  j.staff_url,
  CASE WHEN j.is_guest THEN COALESCE(j.guest_name, 'Gäst')
       ELSE COALESCE(NULLIF(TRIM(CONCAT(ps.first_name, ' ', ps.last_name)), ''), j.staff_name, 'Okänd') END AS display_name,
  j.is_guest,
  j.costgroup_name,
  j.scheduled_start,
  j.scheduled_end,
  j.estimated_cost,
  COALESCE(j.real_start, j.logged_start) AS clocked_in_at,
  COALESCE(j.real_stop, j.stop) AS clocked_out_at,
  CASE
    WHEN j.logged_time_url IS NOT NULL AND j.stop IS NULL THEN 'pa_plats'
    WHEN j.logged_time_url IS NOT NULL AND j.stop IS NOT NULL THEN 'avslutad'
    WHEN j.work_period_url IS NULL THEN 'oplanerad'
    WHEN j.scheduled_start IS NOT NULL AND j.scheduled_start < now() - interval '10 minutes' THEN 'ej_instamplad'
    ELSE 'kommer'
  END AS status,
  CASE WHEN j.stop IS NULL AND j.logged_time_url IS NOT NULL
       THEN EXTRACT(EPOCH FROM (now() - COALESCE(j.real_start, j.logged_start)))::int END AS ongoing_seconds
FROM joined j
LEFT JOIN public.pk_workplaces w ON w.connection_id = j.connection_id AND w.url = j.workplace_url
LEFT JOIN public.stores s ON s.id = w.store_id
LEFT JOIN public.pk_staff ps ON ps.connection_id = j.connection_id AND ps.url = j.staff_url
ORDER BY s.name NULLS LAST, j.scheduled_start NULLS LAST, COALESCE(j.real_start, j.logged_start);

GRANT SELECT ON public.v_pk_clocked_in_now TO authenticated;

-- 9. Daglig personalkostnad
CREATE OR REPLACE FUNCTION public.pk_daily_labor_cost(_store_id uuid, _date date)
RETURNS TABLE (
  store_id uuid,
  day date,
  variable_cost numeric,
  fixed_cost numeric,
  actual_cost numeric,
  scheduled_cost numeric,
  work_time_sec bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH wps AS (
    SELECT connection_id, url FROM public.pk_workplaces WHERE store_id = _store_id
  ),
  var AS (
    SELECT COALESCE(SUM(l.cost), 0) AS c, COALESCE(SUM(l.work_time_sec), 0)::bigint AS secs
    FROM public.pk_logged_times l
    JOIN wps ON wps.connection_id = l.connection_id AND wps.url = l.workplace_url
    WHERE l.stop IS NOT NULL AND NOT l.is_canceled AND NOT l.is_guest
      AND (l.start AT TIME ZONE 'Europe/Stockholm')::date = _date
  ),
  fixed AS (
    SELECT COALESCE(SUM(e.fixed_cost_per_day), 0) AS c
    FROM public.pk_staff s
    JOIN wps ON wps.connection_id = s.connection_id AND wps.url = s.workplace_url
    JOIN public.pk_staff_employments e
      ON e.connection_id = s.connection_id AND e.staff_url = s.url
     AND e.start <= _date AND (e."end" IS NULL OR e."end" >= _date)
    WHERE COALESCE(e.fixed_cost_per_day, 0) > 0
  ),
  sched AS (
    SELECT COALESCE(SUM(p.estimated_cost), 0) AS c
    FROM public.pk_work_periods p
    JOIN wps ON wps.connection_id = p.connection_id AND wps.url = p.workplace_url
    WHERE p.date = _date AND p.is_published AND NOT p.is_deleted
  )
  SELECT _store_id, _date, var.c, fixed.c, var.c + fixed.c, sched.c, var.secs
  FROM var, fixed, sched;
$$;

REVOKE ALL ON FUNCTION public.pk_daily_labor_cost(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_daily_labor_cost(uuid, date) TO authenticated, service_role;