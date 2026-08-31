CREATE TABLE public.payroll_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  exported_at TIMESTAMPTZ,
  exported_by UUID,
  blocked_reason TEXT,
  fortnox_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_exports_status_chk CHECK (status IN ('draft','blocked','approved','exported','cancelled'))
);
GRANT SELECT, INSERT, UPDATE ON public.payroll_exports TO authenticated;
GRANT ALL ON public.payroll_exports TO service_role;
ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_exports_read" ON public.payroll_exports FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "payroll_exports_write" ON public.payroll_exports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.payroll_export_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  export_id UUID NOT NULL REFERENCES public.payroll_exports(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  work_site_id UUID REFERENCES public.work_sites(id) ON DELETE SET NULL,
  regular_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  ob_50_minutes INTEGER NOT NULL DEFAULT 0,
  ob_70_minutes INTEGER NOT NULL DEFAULT 0,
  ob_100_minutes INTEGER NOT NULL DEFAULT 0,
  wage_code_missing BOOLEAN NOT NULL DEFAULT false,
  correction_period TEXT,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payroll_export_lines TO authenticated;
GRANT ALL ON public.payroll_export_lines TO service_role;
ALTER TABLE public.payroll_export_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_export_lines_read" ON public.payroll_export_lines FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "payroll_export_lines_write" ON public.payroll_export_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.inspector_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  work_site_id UUID REFERENCES public.work_sites(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.inspector_sessions TO authenticated;
GRANT ALL ON public.inspector_sessions TO service_role;
ALTER TABLE public.inspector_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspector_sessions_admin" ON public.inspector_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER payroll_exports_touch BEFORE UPDATE ON public.payroll_exports
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();