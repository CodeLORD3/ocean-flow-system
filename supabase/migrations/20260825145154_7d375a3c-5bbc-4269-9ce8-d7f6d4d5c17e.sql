-- ===== employees =====
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid UNIQUE REFERENCES public.staff(id) ON DELETE SET NULL,
  pk_staff_id text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  profile_image_url text,
  birth_date date,
  address_street text,
  postal_code text,
  city text,
  country text DEFAULT 'SE',
  -- Personnummer lagras ALDRIG i klartext: hash för uppslag + maskerad visning
  pnr_hash text UNIQUE,
  pnr_masked text,
  pnr_last4 text,
  alt_clock_identifier text UNIQUE,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_staff_id_idx ON public.employees(staff_id);
CREATE INDEX employees_name_idx ON public.employees(last_name, first_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees readable by staff" ON public.employees
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Managers manage employees" ON public.employees
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

-- ===== employments =====
CREATE TABLE public.employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  employment_number text,
  fortnox_employee_id text,
  bexio_employee_id text,
  job_title text,
  form text NOT NULL DEFAULT 'tillsvidare',
  start_date date,
  end_date date,
  probation_end_date date,
  conversion_date date,
  employment_rate numeric NOT NULL DEFAULT 100,
  pay_type text NOT NULL DEFAULT 'monthly',
  monthly_salary numeric,
  hourly_rate numeric,
  cost_center text,
  tax_table integer,
  tax_column integer,
  tax_adjustment numeric,
  vacation_rule text NOT NULL DEFAULT 'sammalon',
  vacation_days integer NOT NULL DEFAULT 25,
  vacation_supplement_pct numeric NOT NULL DEFAULT 0.43,
  pension_lf boolean NOT NULL DEFAULT true,
  agreement_area text NOT NULL DEFAULT 'butik',
  ch_notes text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employments_form_chk CHECK (form IN ('tillsvidare','sarskild_visstid','prov','vikariat','sasong')),
  CONSTRAINT employments_pay_type_chk CHECK (pay_type IN ('monthly','hourly')),
  CONSTRAINT employments_vacation_rule_chk CHECK (vacation_rule IN ('sammalon','procent')),
  CONSTRAINT employments_agreement_area_chk CHECK (agreement_area IN ('butik','lager','beredning','tjansteman'))
);
CREATE INDEX employments_employee_idx ON public.employments(employee_id);
CREATE INDEX employments_entity_idx ON public.employments(legal_entity_id);
CREATE UNIQUE INDEX employments_number_unique ON public.employments(legal_entity_id, employment_number)
  WHERE employment_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employments TO authenticated;
GRANT ALL ON public.employments TO service_role;
ALTER TABLE public.employments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read employments" ON public.employments
  FOR SELECT TO authenticated
  USING (public.is_staff_manager() AND (legal_entity_id IS NULL OR public.can_see_company(legal_entity_id)));
CREATE POLICY "Managers manage employments" ON public.employments
  FOR ALL TO authenticated
  USING (public.is_staff_manager() AND (legal_entity_id IS NULL OR public.can_see_company(legal_entity_id)))
  WITH CHECK (public.is_staff_manager() AND (legal_entity_id IS NULL OR public.can_see_company(legal_entity_id)));

-- ===== employee_documents =====
CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employment_id uuid REFERENCES public.employments(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'ovrigt',
  title text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  file_size integer,
  signature_status text NOT NULL DEFAULT 'ej_krav',
  signed_at timestamptz,
  expires_at date,
  uploaded_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_documents_sig_chk CHECK (signature_status IN ('ej_krav','vantar','signerad'))
);
CREATE INDEX employee_documents_employee_idx ON public.employee_documents(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Docs readable by staff" ON public.employee_documents
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Managers manage employee docs" ON public.employee_documents
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

-- ===== updated_at =====
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER employments_updated_at BEFORE UPDATE ON public.employments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER employee_documents_updated_at BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();