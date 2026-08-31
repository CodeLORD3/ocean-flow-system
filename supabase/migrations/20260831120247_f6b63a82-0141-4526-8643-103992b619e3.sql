-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.ledger_obligation AS ENUM ('ja', 'nej', 'utred');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.work_site_kind AS ENUM ('storkok', 'produktion', 'butik', 'inkop', 'transport', 'extern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ WORK SITES ============
CREATE TABLE public.work_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind public.work_site_kind NOT NULL DEFAULT 'produktion',
  cost_center TEXT,
  posting_cost_center TEXT NOT NULL,
  is_own_premises BOOLEAN NOT NULL DEFAULT true,
  ledger_required public.ledger_obligation NOT NULL DEFAULT 'utred',
  ledger_note TEXT,
  geofence_lat DOUBLE PRECISION,
  geofence_lng DOUBLE PRECISION,
  geofence_radius_m INTEGER NOT NULL DEFAULT 150,
  allow_mobile_punch BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_sites TO authenticated;
GRANT ALL ON public.work_sites TO service_role;
ALTER TABLE public.work_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_sites_read" ON public.work_sites FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "work_sites_write" ON public.work_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER work_sites_touch BEFORE UPDATE ON public.work_sites
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- ============ TIME ENTRIES: site, geo, sync ============
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS work_site_id UUID REFERENCES public.work_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS punch_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punch_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punch_accuracy_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS distance_m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS geofence_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offline_queued BOOLEAN NOT NULL DEFAULT false;

-- ============ COST CENTER ALLOCATION PER INTERVAL ============
CREATE TABLE public.time_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_site_id UUID NOT NULL REFERENCES public.work_sites(id) ON DELETE RESTRICT,
  cost_center TEXT NOT NULL,
  legal_entity_id TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  start_entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
  end_entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
  corrects_allocation_id UUID REFERENCES public.time_allocations(id) ON DELETE SET NULL,
  correction_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX time_allocations_employee_start_idx ON public.time_allocations (employee_id, started_at DESC);
GRANT SELECT, INSERT ON public.time_allocations TO authenticated;
GRANT ALL ON public.time_allocations TO service_role;
ALTER TABLE public.time_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_allocations_read" ON public.time_allocations FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));
CREATE POLICY "time_allocations_insert" ON public.time_allocations FOR INSERT TO authenticated
  WITH CHECK (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));

-- ============ WAGE CODES ============
CREATE TABLE public.wage_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ob',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wage_codes TO authenticated;
GRANT ALL ON public.wage_codes TO service_role;
ALTER TABLE public.wage_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wage_codes_read" ON public.wage_codes FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "wage_codes_write" ON public.wage_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER wage_codes_touch BEFORE UPDATE ON public.wage_codes
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- ============ WORK RULES (versioned, as data) ============
CREATE TABLE public.work_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id TEXT,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  value_numeric NUMERIC(12,2),
  value_text TEXT,
  unit TEXT,
  legal_source TEXT,
  agreement_source TEXT,
  is_unverified BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX work_rules_key_version_idx
  ON public.work_rules (rule_key, COALESCE(legal_entity_id, '*'), version);
GRANT SELECT, INSERT, UPDATE ON public.work_rules TO authenticated;
GRANT ALL ON public.work_rules TO service_role;
ALTER TABLE public.work_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_rules_read" ON public.work_rules FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "work_rules_write" ON public.work_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER work_rules_touch BEFORE UPDATE ON public.work_rules
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- ============ OB WINDOWS ============
CREATE TABLE public.ob_windows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id TEXT,
  name TEXT NOT NULL,
  day_kind TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  pct NUMERIC(6,2) NOT NULL,
  wage_code_id UUID REFERENCES public.wage_codes(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  agreement_source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ob_windows_day_kind_chk CHECK (day_kind IN ('weekday', 'saturday', 'sunday', 'holiday'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_windows TO authenticated;
GRANT ALL ON public.ob_windows TO service_role;
ALTER TABLE public.ob_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_windows_read" ON public.ob_windows FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "ob_windows_write" ON public.ob_windows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER ob_windows_touch BEFORE UPDATE ON public.ob_windows
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- ============ PAYROLL HOLIDAYS (editable per year) ============
CREATE TABLE public.payroll_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'SE',
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  is_major_holiday BOOLEAN NOT NULL DEFAULT false,
  treated_as TEXT NOT NULL DEFAULT 'holiday',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_holidays_unique UNIQUE (country_code, holiday_date),
  CONSTRAINT payroll_holidays_treated_chk CHECK (treated_as IN ('holiday', 'saturday', 'weekday'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_holidays TO authenticated;
GRANT ALL ON public.payroll_holidays TO service_role;
ALTER TABLE public.payroll_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_holidays_read" ON public.payroll_holidays FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "payroll_holidays_write" ON public.payroll_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER payroll_holidays_touch BEFORE UPDATE ON public.payroll_holidays
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();