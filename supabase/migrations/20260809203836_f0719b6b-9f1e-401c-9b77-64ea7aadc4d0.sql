-- 5B: nedkylning av kokta skaldjur, kopplad till partiet
CREATE TABLE public.chilling_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  batch_label text,
  cooked_at timestamptz,
  start_temp_c numeric(5,1),
  end_temp_c numeric(5,1) NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer,
  status text NOT NULL DEFAULT 'godkand',
  comment text,
  deviation_id uuid REFERENCES public.deviations(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chilling_records TO authenticated;
GRANT ALL ON public.chilling_records TO service_role;
ALTER TABLE public.chilling_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser nedkylningar" ON public.chilling_records
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Personal registrerar nedkylningar" ON public.chilling_records
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Personal rattar nedkylningar" ON public.chilling_records
  FOR UPDATE TO authenticated USING (public.is_staff());
CREATE POLICY "Chef raderar nedkylningar" ON public.chilling_records
  FOR DELETE TO authenticated USING (public.is_staff_manager());

CREATE INDEX idx_chilling_records_lot ON public.chilling_records(lot_id);

CREATE TRIGGER trg_chilling_records_updated
  BEFORE UPDATE ON public.chilling_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bedomning: kokta skaldjur ska ner till atta grader inom fyra timmar
CREATE OR REPLACE FUNCTION public.evaluate_chilling_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mins numeric;
  breach boolean := false;
  reason text;
  lot_no text;
  dev_id uuid;
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Nedkylningen slutar innan den borjar.';
  END IF;

  mins := EXTRACT(EPOCH FROM (NEW.end_at - NEW.start_at)) / 60;
  NEW.duration_minutes := ROUND(mins);

  IF NEW.end_temp_c > 8 THEN
    breach := true;
    reason := format('Nedkylningen slutade pa %s grader, gransen ar 8 grader.', NEW.end_temp_c);
  ELSIF mins > 240 THEN
    breach := true;
    reason := format('Nedkylningen tog %s minuter, gransen ar 240 minuter.', ROUND(mins));
  END IF;

  NEW.status := CASE WHEN breach THEN 'avvikelse' ELSE 'godkand' END;

  IF breach AND NEW.deviation_id IS NULL THEN
    SELECT lot_number INTO lot_no FROM public.lots WHERE id = NEW.lot_id;
    INSERT INTO public.deviations (source, source_id, title, description, created_by)
    VALUES ('chilling_record', NEW.id::text,
            'Nedkylning kokta skaldjur ' || COALESCE(lot_no, ''),
            COALESCE(NEW.comment || ' — ', '') || reason,
            NEW.recorded_by)
    RETURNING id INTO dev_id;
    NEW.deviation_id := dev_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evaluate_chilling_record
  BEFORE INSERT OR UPDATE ON public.chilling_records
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_chilling_record();

-- 5B: sparr for parasitfrysning. Returnerar hinder som text, eller NULL nar partiet ar fritt.
CREATE OR REPLACE FUNCTION public.lot_parasite_block_reason(_lot_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.lots;
BEGIN
  IF _lot_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO l FROM public.lots WHERE id = _lot_id;
  IF NOT FOUND OR NOT COALESCE(l.parasite_treatment_required, false) THEN
    RETURN NULL;
  END IF;

  -- Dokumenterad frysbehandling: tiderna ar redan validerade av trg_validate_parasite_freeze
  IF l.freeze_start IS NOT NULL AND l.freeze_end IS NOT NULL AND l.freeze_temp IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Registrerat undantag kraver bade skal och kalla
  IF COALESCE(l.exemption_reason, '') <> '' AND COALESCE(l.exemption_source, '') <> '' THEN
    RETURN NULL;
  END IF;

  RETURN format('Parti %s ska atas ratt och saknar dokumenterad frysbehandling eller registrerat undantag.',
                COALESCE(l.lot_number, l.id::text));
END;
$$;

-- Spar utleverans och forsaljning av obehandlade partier
CREATE OR REPLACE FUNCTION public.block_untreated_lot_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reason text;
BEGIN
  IF NEW.movement_type IN ('overforing_ut', 'forsaljning', 'kundorder', 'tillverkning_ut') THEN
    reason := public.lot_parasite_block_reason(NEW.lot_id);
    IF reason IS NOT NULL THEN
      RAISE EXCEPTION '%', reason;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_untreated_lot_movement
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_untreated_lot_movement();

-- Spar flyttorderrader med obehandlade partier
CREATE OR REPLACE FUNCTION public.block_untreated_lot_transfer_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reason text;
BEGIN
  reason := public.lot_parasite_block_reason(NEW.lot_id);
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_untreated_lot_transfer_line
  BEFORE INSERT OR UPDATE OF lot_id ON public.transfer_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_untreated_lot_transfer_line();

-- Spar prissattning: ett obehandlat parti far inte lamna preliminart pris
CREATE OR REPLACE FUNCTION public.block_untreated_lot_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reason text;
BEGIN
  IF NEW.price_status IS DISTINCT FROM OLD.price_status
     AND COALESCE(NEW.price_status, '') <> 'preliminar' THEN
    reason := public.lot_parasite_block_reason(NEW.id);
    IF reason IS NOT NULL THEN
      RAISE EXCEPTION '% Priset kan inte faststallas.', reason;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_untreated_lot_pricing
  BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.block_untreated_lot_pricing();