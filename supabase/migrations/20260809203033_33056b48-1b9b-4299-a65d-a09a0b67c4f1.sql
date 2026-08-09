-- Del 5B och 5C: temperatur, parasitfrysning, blötdjur och instrument

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS receiving_temp_c numeric(5,2),
  ADD COLUMN IF NOT EXISTS receiving_temp_deviation_reason text,
  ADD COLUMN IF NOT EXISTS parasite_treatment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_temp numeric(5,2),
  ADD COLUMN IF NOT EXISTS freeze_start timestamptz,
  ADD COLUMN IF NOT EXISTS freeze_end timestamptz,
  ADD COLUMN IF NOT EXISTS freeze_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exemption_reason text,
  ADD COLUMN IF NOT EXISTS exemption_source text,
  ADD COLUMN IF NOT EXISTS bivalve_registration_doc text,
  ADD COLUMN IF NOT EXISTS production_area_classification text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS parasite_treatment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bivalve boolean NOT NULL DEFAULT false;

-- Frysbehandlingen måste uppfylla minst -20 C i 24 timmar eller -35 C i 15 timmar.
CREATE OR REPLACE FUNCTION public.validate_parasite_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  hours numeric;
BEGIN
  IF NEW.freeze_start IS NOT NULL AND NEW.freeze_end IS NOT NULL THEN
    IF NEW.freeze_temp IS NULL THEN
      RAISE EXCEPTION 'Frysbehandlingen saknar temperatur.';
    END IF;
    IF NEW.freeze_end <= NEW.freeze_start THEN
      RAISE EXCEPTION 'Frysbehandlingen slutar innan den börjar.';
    END IF;
    hours := EXTRACT(EPOCH FROM (NEW.freeze_end - NEW.freeze_start)) / 3600;
    IF NEW.freeze_temp <= -35 THEN
      IF hours < 15 THEN
        RAISE EXCEPTION 'Vid minus 35 grader krävs minst 15 timmar, angivet: % timmar.', round(hours, 1);
      END IF;
    ELSIF NEW.freeze_temp <= -20 THEN
      IF hours < 24 THEN
        RAISE EXCEPTION 'Vid minus 20 grader krävs minst 24 timmar, angivet: % timmar.', round(hours, 1);
      END IF;
    ELSE
      RAISE EXCEPTION 'Frysbehandling kräver minst minus 20 grader.';
    END IF;
  ELSIF NEW.freeze_end IS NOT NULL AND NEW.freeze_start IS NULL THEN
    RAISE EXCEPTION 'Frysbehandlingen saknar starttid.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_parasite_freeze
  BEFORE INSERT OR UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.validate_parasite_freeze();

-- Nya partier ärver kravet från produkten.
CREATE OR REPLACE FUNCTION public.set_lot_parasite_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.parasite_treatment_required = false THEN
    SELECT COALESCE(p.parasite_treatment_required, false) INTO NEW.parasite_treatment_required
    FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_lot_parasite_flag
  BEFORE INSERT ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.set_lot_parasite_flag();

CREATE TABLE public.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instrument_type text NOT NULL DEFAULT 'termometer',
  serial_number text,
  placement text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  calibration_interval_months integer NOT NULL DEFAULT 12,
  last_calibrated date,
  next_calibration date,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instruments TO authenticated;
GRANT ALL ON public.instruments TO service_role;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser instrument" ON public.instruments
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Chef hanterar instrument" ON public.instruments
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

CREATE TRIGGER trg_instruments_updated BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_instrument_next_calibration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_calibrated IS NOT NULL THEN
    NEW.next_calibration := NEW.last_calibrated
      + (COALESCE(NEW.calibration_interval_months, 12) || ' months')::interval;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_instrument_next_calibration
  BEFORE INSERT OR UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.set_instrument_next_calibration();

ALTER TABLE public.control_records
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL;

ALTER TABLE public.control_points
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL;