CREATE TABLE public.payroll_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL,
  agreement_area text NOT NULL DEFAULT 'butik',
  policy_name text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  ob_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  overtime_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  benefit_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  holiday_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  no_ob_and_overtime_overlap boolean NOT NULL DEFAULT true,
  vacation_reserve_pct numeric(8,4) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, agreement_area, valid_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_policies TO authenticated;
GRANT ALL ON public.payroll_policies TO service_role;
ALTER TABLE public.payroll_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payroll policies are visible within company" ON public.payroll_policies FOR SELECT TO authenticated USING (public.can_see_company(legal_entity_id));
CREATE POLICY "Payroll policies are managed by admins" ON public.payroll_policies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.holiday_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text,
  country_code text NOT NULL DEFAULT 'SE',
  holiday_date date NOT NULL,
  label text NOT NULL,
  is_half_day boolean NOT NULL DEFAULT false,
  is_public_holiday boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, holiday_date, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_calendar TO authenticated;
GRANT ALL ON public.holiday_calendar TO service_role;
ALTER TABLE public.holiday_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Holiday calendar is visible within company" ON public.holiday_calendar FOR SELECT TO authenticated USING (legal_entity_id IS NULL OR public.can_see_company(legal_entity_id));
CREATE POLICY "Holiday calendar is managed by admins" ON public.holiday_calendar FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  computed_at timestamptz,
  reviewed_at timestamptz,
  exported_at timestamptz,
  exported_by uuid,
  fortnox_batch_ref text,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payroll periods are visible within company" ON public.payroll_periods FOR SELECT TO authenticated USING (public.can_see_company(legal_entity_id));
CREATE POLICY "Payroll periods are managed by admins" ON public.payroll_periods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  legal_entity_id text NOT NULL,
  store_id uuid,
  employee_id uuid NOT NULL,
  employment_id uuid,
  line_type text NOT NULL,
  line_date date NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  extent_pct numeric(8,4),
  unit_amount numeric(14,2),
  cost_center text,
  source_ref text,
  source_type text,
  note text,
  preliminary_cost numeric(14,2),
  fortnox_transaction_id uuid,
  export_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_lines TO authenticated;
GRANT ALL ON public.payroll_lines TO service_role;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payroll lines are visible within scoped company and store" ON public.payroll_lines FOR SELECT TO authenticated USING (public.can_see_company(legal_entity_id) AND (store_id IS NULL OR public.can_see_store(store_id)));
CREATE POLICY "Payroll lines are managed by admins" ON public.payroll_lines FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.fortnox_wage_code_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL,
  agreement_area text NOT NULL DEFAULT 'butik',
  line_type text NOT NULL,
  fortnox_code text NOT NULL,
  paxml_code text,
  transaction_type text NOT NULL DEFAULT 'attendance',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, agreement_area, line_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fortnox_wage_code_map TO authenticated;
GRANT ALL ON public.fortnox_wage_code_map TO service_role;
ALTER TABLE public.fortnox_wage_code_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wage mappings are visible within company" ON public.fortnox_wage_code_map FOR SELECT TO authenticated USING (public.can_see_company(legal_entity_id));
CREATE POLICY "Wage mappings are managed by admins" ON public.fortnox_wage_code_map FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL,
  store_id uuid,
  employee_id uuid NOT NULL,
  employment_id uuid,
  benefit_type text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  basis numeric(14,2),
  basis_unit text,
  calculation_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  annual_limit numeric(14,2),
  receipt_ref text,
  meals_included boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benefits TO authenticated;
GRANT ALL ON public.benefits TO service_role;
ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Benefits are visible only to scoped admins" ON public.benefits FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) AND public.can_see_company(legal_entity_id) AND (store_id IS NULL OR public.can_see_store(store_id)));
CREATE POLICY "Benefits are managed by admins" ON public.benefits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL,
  store_id uuid,
  employee_id uuid NOT NULL,
  employment_id uuid,
  deduction_type text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_period text NOT NULL DEFAULT 'monthly',
  valid_from date NOT NULL,
  valid_to date,
  enforcement_reference text,
  protected_amount numeric(14,2),
  consent_document_ref text,
  legal_basis text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_deductions TO authenticated;
GRANT ALL ON public.payroll_deductions TO service_role;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deductions are visible only to scoped admins" ON public.payroll_deductions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) AND public.can_see_company(legal_entity_id) AND (store_id IS NULL OR public.can_see_store(store_id)));
CREATE POLICY "Deductions are managed by admins" ON public.payroll_deductions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.tax_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer NOT NULL,
  table_number integer NOT NULL,
  tax_column integer NOT NULL,
  income_from numeric(14,2) NOT NULL,
  income_to numeric(14,2),
  fixed_tax numeric(14,2) NOT NULL DEFAULT 0,
  percentage numeric(8,4) NOT NULL DEFAULT 0,
  tax_kind text NOT NULL DEFAULT 'monthly',
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tax_year, table_number, tax_column, income_from, tax_kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_tables TO authenticated;
GRANT ALL ON public.tax_tables TO service_role;
ALTER TABLE public.tax_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tax tables are readable by staff" ON public.tax_tables FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Tax tables are managed by admins" ON public.tax_tables FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.employer_contribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text,
  rule_name text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  birth_year_from integer,
  birth_year_to integer,
  salary_cap numeric(14,2),
  contribution_rate numeric(8,4) NOT NULL,
  pension_rate numeric(8,4),
  growth_support_note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_contribution_rules TO authenticated;
GRANT ALL ON public.employer_contribution_rules TO service_role;
ALTER TABLE public.employer_contribution_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contribution rules are visible within company" ON public.employer_contribution_rules FOR SELECT TO authenticated USING (legal_entity_id IS NULL OR public.can_see_company(legal_entity_id));
CREATE POLICY "Contribution rules are managed by admins" ON public.employer_contribution_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.payroll_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL,
  legal_entity_id text NOT NULL,
  transaction_type text NOT NULL,
  request_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  http_status integer,
  retry_count integer NOT NULL DEFAULT 0,
  fortnox_result_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_export_log TO authenticated;
GRANT ALL ON public.payroll_export_log TO service_role;
ALTER TABLE public.payroll_export_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payroll export logs are visible within company" ON public.payroll_export_log FOR SELECT TO authenticated USING (public.can_see_company(legal_entity_id));
CREATE POLICY "Payroll export logs are managed by admins" ON public.payroll_export_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.lf_pension_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL,
  legal_entity_id text NOT NULL,
  format_version text NOT NULL DEFAULT 'generic-csv',
  file_path text,
  row_count integer NOT NULL DEFAULT 0,
  generated_by uuid,
  downloaded_at timestamptz,
  downloaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lf_pension_exports TO authenticated;
GRANT ALL ON public.lf_pension_exports TO service_role;
ALTER TABLE public.lf_pension_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pension exports are visible only to scoped admins" ON public.lf_pension_exports FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) AND public.can_see_company(legal_entity_id));
CREATE POLICY "Pension exports are managed by admins" ON public.lf_pension_exports FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE INDEX idx_payroll_lines_period ON public.payroll_lines (period_id, line_date);
CREATE INDEX idx_payroll_lines_employee ON public.payroll_lines (employee_id, line_date);
CREATE INDEX idx_payroll_export_log_period ON public.payroll_export_log (payroll_period_id, created_at DESC);
CREATE INDEX idx_benefits_employee ON public.benefits (employee_id, valid_from);
CREATE INDEX idx_payroll_deductions_employee ON public.payroll_deductions (employee_id, valid_from);
CREATE INDEX idx_tax_tables_lookup ON public.tax_tables (tax_year, table_number, tax_column, income_from);

CREATE OR REPLACE FUNCTION public.touch_payroll_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_policies_updated_at BEFORE UPDATE ON public.payroll_policies FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER holiday_calendar_updated_at BEFORE UPDATE ON public.holiday_calendar FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER payroll_periods_updated_at BEFORE UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER payroll_lines_updated_at BEFORE UPDATE ON public.payroll_lines FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER fortnox_wage_code_map_updated_at BEFORE UPDATE ON public.fortnox_wage_code_map FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER benefits_updated_at BEFORE UPDATE ON public.benefits FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER payroll_deductions_updated_at BEFORE UPDATE ON public.payroll_deductions FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER tax_tables_updated_at BEFORE UPDATE ON public.tax_tables FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();
CREATE TRIGGER employer_contribution_rules_updated_at BEFORE UPDATE ON public.employer_contribution_rules FOR EACH ROW EXECUTE FUNCTION public.touch_payroll_updated_at();