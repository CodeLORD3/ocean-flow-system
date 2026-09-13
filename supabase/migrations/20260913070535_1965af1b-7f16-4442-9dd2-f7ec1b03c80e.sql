CREATE TABLE public.stock_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  count_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Stockholm')::date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  filled_by text,
  handed_to text,
  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, count_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_sessions TO authenticated;
GRANT ALL ON public.stock_count_sessions TO service_role;
ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage stock count sessions"
  ON public.stock_count_sessions FOR ALL TO authenticated
  USING (is_staff() AND can_see_store(store_id))
  WITH CHECK (is_staff() AND can_see_store(store_id));

CREATE TABLE public.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  counted_qty numeric,
  unit text,
  quality text CHECK (quality IS NULL OR quality IN ('1-7','7+')),
  comment text,
  system_qty numeric,
  counted_by uuid DEFAULT auth.uid(),
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_id, location_id)
);

CREATE INDEX idx_stock_count_lines_session ON public.stock_count_lines(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_count_lines TO service_role;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage stock count lines"
  ON public.stock_count_lines FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (
    SELECT 1 FROM public.stock_count_sessions s
    WHERE s.id = stock_count_lines.session_id AND can_see_store(s.store_id)))
  WITH CHECK (is_staff() AND EXISTS (
    SELECT 1 FROM public.stock_count_sessions s
    WHERE s.id = stock_count_lines.session_id AND can_see_store(s.store_id)));

CREATE TRIGGER trg_stock_count_sessions_updated_at
  BEFORE UPDATE ON public.stock_count_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_stock_count_lines_updated_at
  BEFORE UPDATE ON public.stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.block_locked_stock_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.stock_count_sessions
   WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  IF _status = 'locked' THEN
    RAISE EXCEPTION 'Inventeringen är låst och kan inte ändras';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_stock_count_lines_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_locked_stock_count();