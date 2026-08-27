-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.my_employee_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employees e
  JOIN public.staff s ON s.id = e.staff_id
  WHERE s.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_employee_store_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT em.store_id FROM public.employments em
  WHERE em.store_id IS NOT NULL
    AND em.is_active
    AND em.employee_id IN (SELECT public.my_employee_ids())
$$;

CREATE OR REPLACE FUNCTION public.can_manage_schedule(_store_id uuid, _legal_entity_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_see_clock_store(_store_id, _legal_entity_id)
     AND (
       public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'platform_admin')
       OR public.has_role(auth.uid(), 'group_admin')
       OR public.has_role(auth.uid(), 'region_admin')
       OR public.has_role(auth.uid(), 'company_admin')
       OR public.has_role(auth.uid(), 'multi_store_manager')
       OR public.has_role(auth.uid(), 'store_manager')
     )
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ shift_types ============
CREATE TABLE public.shift_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_entity_id text,
  color_token text NOT NULL DEFAULT 'accent-500',
  is_payroll_relevant boolean NOT NULL DEFAULT true,
  is_swappable boolean NOT NULL DEFAULT true,
  required_competency text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_types TO authenticated;
GRANT ALL ON public.shift_types TO service_role;
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_types read" ON public.shift_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_types manage" ON public.shift_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'company_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'company_admin'));
CREATE TRIGGER shift_types_touch BEFORE UPDATE ON public.shift_types FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.shift_types (name, color_token, is_payroll_relevant, sort_order) VALUES
  ('Ordinarie','accent-600',true,1),
  ('Provpass','neutral-500',true,2),
  ('Utbildning','accent-400',true,3),
  ('Möte','neutral-700',true,4);

-- ============ employee_competencies ============
CREATE TABLE public.employee_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  competency text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, competency)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_competencies TO authenticated;
GRANT ALL ON public.employee_competencies TO service_role;
ALTER TABLE public.employee_competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competencies read" ON public.employee_competencies FOR SELECT TO authenticated
  USING (public.can_see_employee(employee_id) OR public.employee_is_self(employee_id));
CREATE POLICY "competencies manage" ON public.employee_competencies FOR ALL TO authenticated
  USING (public.can_see_employee(employee_id) AND public.is_staff_manager())
  WITH CHECK (public.can_see_employee(employee_id) AND public.is_staff_manager());

-- ============ schedule_imports ============
CREATE TABLE public.schedule_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  source text NOT NULL DEFAULT 'template' CHECK (source IN ('template','ai_fallback')),
  status text NOT NULL DEFAULT 'parsing' CHECK (status IN ('parsing','review','imported','undone')),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  row_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_imports TO authenticated;
GRANT ALL ON public.schedule_imports TO service_role;
ALTER TABLE public.schedule_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports manage" ON public.schedule_imports FOR ALL TO authenticated
  USING (public.can_manage_schedule(store_id, legal_entity_id))
  WITH CHECK (public.can_manage_schedule(store_id, legal_entity_id));
CREATE TRIGGER schedule_imports_touch BEFORE UPDATE ON public.schedule_imports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ shifts ============
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  legal_entity_id text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  shift_type_id uuid REFERENCES public.shift_types(id) ON DELETE SET NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  published_at timestamptz,
  note text,
  import_id uuid REFERENCES public.schedule_imports(id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shifts_store_date_idx ON public.shifts (store_id, date);
CREATE INDEX shifts_employee_date_idx ON public.shifts (employee_id, date);
CREATE INDEX shifts_import_idx ON public.shifts (import_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts manager all" ON public.shifts FOR ALL TO authenticated
  USING (public.can_manage_schedule(store_id, legal_entity_id))
  WITH CHECK (public.can_manage_schedule(store_id, legal_entity_id));
CREATE POLICY "shifts employee read" ON public.shifts FOR SELECT TO authenticated
  USING (
    public.employee_is_self(employee_id)
    OR (status = 'published' AND store_id IN (SELECT public.my_employee_store_ids()))
    OR (employee_id IS NULL AND status = 'published' AND store_id IN (SELECT public.my_employee_store_ids()))
  );
CREATE TRIGGER shifts_touch BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ shift_history ============
CREATE TABLE public.shift_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shift_history_shift_idx ON public.shift_history (shift_id, changed_at DESC);
GRANT SELECT ON public.shift_history TO authenticated;
GRANT ALL ON public.shift_history TO service_role;
ALTER TABLE public.shift_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift history read" ON public.shift_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shifts s WHERE s.id = shift_history.shift_id AND public.can_manage_schedule(s.store_id, s.legal_entity_id)));

CREATE OR REPLACE FUNCTION public.log_shift_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE diff jsonb := '{}'::jsonb; k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.shift_history (shift_id, action, changes, changed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(to_jsonb(NEW)) LOOP
      IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k AND k NOT IN ('updated_at') THEN
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(OLD)->k, 'to', to_jsonb(NEW)->k));
      END IF;
    END LOOP;
    IF diff <> '{}'::jsonb THEN
      INSERT INTO public.shift_history (shift_id, action, changes, changed_by)
      VALUES (NEW.id, CASE WHEN OLD.status <> NEW.status THEN 'status_' || NEW.status ELSE 'updated' END, diff, auth.uid());
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.shift_history (shift_id, action, changes, changed_by)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END; $$;
CREATE TRIGGER shifts_history_ins AFTER INSERT ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.log_shift_change();
CREATE TRIGGER shifts_history_upd AFTER UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.log_shift_change();
CREATE TRIGGER shifts_history_del AFTER DELETE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.log_shift_change();

-- ============ shift_templates ============
CREATE TABLE public.shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  legal_entity_id text,
  name text NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  shift_type_id uuid REFERENCES public.shift_types(id) ON DELETE SET NULL,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_templates TO authenticated;
GRANT ALL ON public.shift_templates TO service_role;
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates manage" ON public.shift_templates FOR ALL TO authenticated
  USING (public.can_manage_schedule(store_id, legal_entity_id))
  WITH CHECK (public.can_manage_schedule(store_id, legal_entity_id));
CREATE TRIGGER shift_templates_touch BEFORE UPDATE ON public.shift_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ availability ============
CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday integer CHECK (weekday BETWEEN 1 AND 7),
  date date,
  from_time time NOT NULL,
  to_time time NOT NULL,
  type text NOT NULL CHECK (type IN ('onskar','otillganglig')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (weekday IS NOT NULL OR date IS NOT NULL)
);
CREATE INDEX availability_employee_idx ON public.availability (employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability self" ON public.availability FOR ALL TO authenticated
  USING (public.employee_is_self(employee_id)) WITH CHECK (public.employee_is_self(employee_id));
CREATE POLICY "availability manager read" ON public.availability FOR SELECT TO authenticated
  USING (public.can_see_employee(employee_id));
CREATE TRIGGER availability_touch BEFORE UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ shift_requests ============
CREATE TABLE public.shift_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('swap','handover','claim_open')),
  from_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  to_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auto_approved','approved','rejected')),
  note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shift_requests_shift_idx ON public.shift_requests (shift_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_requests TO authenticated;
GRANT ALL ON public.shift_requests TO service_role;
ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests manager" ON public.shift_requests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shifts s WHERE s.id = shift_requests.shift_id AND public.can_manage_schedule(s.store_id, s.legal_entity_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shifts s WHERE s.id = shift_requests.shift_id AND public.can_manage_schedule(s.store_id, s.legal_entity_id)));
CREATE POLICY "requests self read" ON public.shift_requests FOR SELECT TO authenticated
  USING (public.employee_is_self(from_employee_id) OR public.employee_is_self(to_employee_id));
CREATE POLICY "requests self create" ON public.shift_requests FOR INSERT TO authenticated
  WITH CHECK (public.employee_is_self(from_employee_id) OR (type = 'claim_open' AND public.employee_is_self(to_employee_id)));
CREATE TRIGGER shift_requests_touch BEFORE UPDATE ON public.shift_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ period_locks ============
CREATE TABLE public.period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  legal_entity_id text,
  period text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid,
  unlocked_at timestamptz,
  unlocked_by uuid,
  unlock_reason text,
  UNIQUE (store_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_locks TO authenticated;
GRANT ALL ON public.period_locks TO service_role;
ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locks read" ON public.period_locks FOR SELECT TO authenticated
  USING (public.can_see_clock_store(store_id, legal_entity_id));
CREATE POLICY "locks manage" ON public.period_locks FOR ALL TO authenticated
  USING (public.can_manage_schedule(store_id, legal_entity_id))
  WITH CHECK (public.can_manage_schedule(store_id, legal_entity_id));

CREATE OR REPLACE FUNCTION public.period_is_locked(_store_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.period_locks pl
    WHERE pl.store_id = _store_id
      AND pl.period = to_char(_date, 'YYYY-MM')
      AND pl.unlocked_at IS NULL
  )
$$;

-- ============ attestations ============
CREATE TABLE public.attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  legal_entity_id text,
  date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  computed jsonb NOT NULL DEFAULT '{}'::jsonb,
  deviation_type text NOT NULL DEFAULT 'none' CHECK (deviation_type IN ('none','sen_in','tidig_ut','missad_rast','oplanerad_tid','missat_pass')),
  status text NOT NULL DEFAULT 'flagged' CHECK (status IN ('auto_approved','flagged','approved','rejected')),
  basis text CHECK (basis IN ('schema','stamplad','justerad')),
  approved_minutes integer,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, date, employee_id, shift_id)
);
CREATE INDEX attestations_store_date_idx ON public.attestations (store_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attestations TO authenticated;
GRANT ALL ON public.attestations TO service_role;
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attest manager" ON public.attestations FOR ALL TO authenticated
  USING (public.can_manage_schedule(store_id, legal_entity_id))
  WITH CHECK (public.can_manage_schedule(store_id, legal_entity_id));
CREATE POLICY "attest self read" ON public.attestations FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id));
CREATE TRIGGER attestations_touch BEFORE UPDATE ON public.attestations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.block_locked_attestation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.period_is_locked(COALESCE(NEW.store_id, OLD.store_id), COALESCE(NEW.date, OLD.date)) THEN
    RAISE EXCEPTION 'Perioden är låst för % — kräver admin-upplåsning', to_char(COALESCE(NEW.date, OLD.date), 'YYYY-MM');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER attestations_lock_guard BEFORE INSERT OR UPDATE ON public.attestations
  FOR EACH ROW EXECUTE FUNCTION public.block_locked_attestation();

CREATE OR REPLACE FUNCTION public.block_locked_time_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.store_id IS NOT NULL AND public.period_is_locked(NEW.store_id, (NEW.occurred_at AT TIME ZONE 'Europe/Stockholm')::date) THEN
    RAISE EXCEPTION 'Perioden är låst — stämplingskorrigering kräver admin-upplåsning';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER time_entries_lock_guard BEFORE INSERT ON public.time_entries
  FOR EACH ROW WHEN (NEW.corrects_entry_id IS NOT NULL) EXECUTE FUNCTION public.block_locked_time_entry();

-- ============ store schedule settings ============
ALTER TABLE public.store_order_settings ADD COLUMN IF NOT EXISTS approval_cutoff_hours integer NOT NULL DEFAULT 48;
