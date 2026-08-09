-- Egenkontroll: generiskt noteringslager (del 5A)

CREATE TABLE public.control_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'temperatur',
  location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'grader C',
  limit_min numeric(10,2),
  limit_max numeric(10,2),
  frequency text NOT NULL DEFAULT 'dagligen',
  responsible_role text,
  zone smallint,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_points TO authenticated;
GRANT ALL ON public.control_points TO service_role;
ALTER TABLE public.control_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser kontrollpunkter" ON public.control_points
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Chef hanterar kontrollpunkter" ON public.control_points
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

CREATE TRIGGER trg_control_points_updated BEFORE UPDATE ON public.control_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.deviations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'control_record',
  source_id text,
  title text,
  description text NOT NULL,
  immediate_action text,
  root_cause text,
  corrective_action text,
  responsible text,
  responsible_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  due_date date,
  verification text,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deviations TO authenticated;
GRANT ALL ON public.deviations TO service_role;
ALTER TABLE public.deviations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser avvikelser" ON public.deviations
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Personal skapar avvikelser" ON public.deviations
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Personal uppdaterar avvikelser" ON public.deviations
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Chef raderar avvikelser" ON public.deviations
  FOR DELETE TO authenticated USING (public.is_staff_manager());

CREATE TRIGGER trg_deviations_updated BEFORE UPDATE ON public.deviations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Spärren: en avvikelse kan inte stängas utan rotorsak och verifiering.
CREATE OR REPLACE FUNCTION public.enforce_deviation_close()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL THEN
    IF COALESCE(btrim(NEW.root_cause), '') = '' THEN
      RAISE EXCEPTION 'Avvikelsen kan inte stängas utan rotorsak.';
    END IF;
    IF COALESCE(btrim(NEW.verification), '') = '' THEN
      RAISE EXCEPTION 'Avvikelsen kan inte stängas utan verifiering av att åtgärden fungerade.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_deviation_close
  BEFORE INSERT OR UPDATE ON public.deviations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deviation_close();

CREATE TABLE public.control_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_point_id uuid NOT NULL REFERENCES public.control_points(id) ON DELETE RESTRICT,
  value_numeric numeric(10,2),
  value_text text,
  value_bool boolean,
  measured_at timestamptz NOT NULL DEFAULT now(),
  measured_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'godkand',
  comment text,
  photo_path text,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  deviation_id uuid REFERENCES public.deviations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_control_records_point_date ON public.control_records (control_point_id, measured_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_records TO authenticated;
GRANT ALL ON public.control_records TO service_role;
ALTER TABLE public.control_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser matningar" ON public.control_records
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Personal registrerar matningar" ON public.control_records
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Personal rattar matningar" ON public.control_records
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Chef raderar matningar" ON public.control_records
  FOR DELETE TO authenticated USING (public.is_staff_manager());

CREATE TRIGGER trg_control_records_updated BEFORE UPDATE ON public.control_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Status mot gränsvärden, och avvikelse skapas automatiskt.
CREATE OR REPLACE FUNCTION public.grade_control_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.control_points;
  breach boolean := false;
  reason text;
  dev_id uuid;
BEGIN
  SELECT * INTO cp FROM public.control_points WHERE id = NEW.control_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontrollpunkten hittades inte.';
  END IF;

  IF NEW.value_numeric IS NOT NULL THEN
    IF cp.limit_min IS NOT NULL AND NEW.value_numeric < cp.limit_min THEN
      breach := true;
      reason := format('%s: %s %s är under gränsen %s.', cp.name, NEW.value_numeric, cp.unit, cp.limit_min);
    ELSIF cp.limit_max IS NOT NULL AND NEW.value_numeric > cp.limit_max THEN
      breach := true;
      reason := format('%s: %s %s är över gränsen %s.', cp.name, NEW.value_numeric, cp.unit, cp.limit_max);
    END IF;
  ELSIF NEW.value_bool IS NOT NULL AND NEW.value_bool = false THEN
    breach := true;
    reason := format('%s: kontrollen är inte godkänd.', cp.name);
  END IF;

  NEW.status := CASE WHEN breach THEN 'avvikelse' ELSE 'godkand' END;

  IF breach AND NEW.deviation_id IS NULL THEN
    INSERT INTO public.deviations (source, source_id, title, description, store_id, establishment_id, created_by)
    VALUES ('control_record', NEW.id::text, cp.name, COALESCE(NEW.comment || ' — ', '') || reason,
            cp.store_id, cp.establishment_id, NEW.measured_by)
    RETURNING id INTO dev_id;
    NEW.deviation_id := dev_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grade_control_record
  BEFORE INSERT ON public.control_records
  FOR EACH ROW EXECUTE FUNCTION public.grade_control_record();

CREATE TABLE public.compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  regulation text,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  interval_months integer NOT NULL DEFAULT 12,
  last_done date,
  next_due date,
  responsible text,
  responsible_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  document_path text,
  document_name text,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_requirements TO authenticated;
GRANT ALL ON public.compliance_requirements TO service_role;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser lagkrav" ON public.compliance_requirements
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Chef hanterar lagkrav" ON public.compliance_requirements
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

CREATE TRIGGER trg_compliance_requirements_updated BEFORE UPDATE ON public.compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- next_due räknas fram från last_done och intervallet.
CREATE OR REPLACE FUNCTION public.set_compliance_next_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_done IS NOT NULL THEN
    NEW.next_due := NEW.last_done + (COALESCE(NEW.interval_months, 12) || ' months')::interval;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_compliance_next_due
  BEFORE INSERT OR UPDATE ON public.compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_compliance_next_due();