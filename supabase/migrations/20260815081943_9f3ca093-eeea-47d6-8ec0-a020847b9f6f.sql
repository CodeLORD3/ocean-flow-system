ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS customer_no bigint;

CREATE SEQUENCE IF NOT EXISTS public.customers_retail_no_seq;

UPDATE public.customers_retail
SET customer_no = nextval('public.customers_retail_no_seq')
WHERE customer_no IS NULL;

ALTER TABLE public.customers_retail
  ALTER COLUMN customer_no SET DEFAULT nextval('public.customers_retail_no_seq');

CREATE UNIQUE INDEX IF NOT EXISTS customers_retail_customer_no_key
  ON public.customers_retail(customer_no);

CREATE TABLE IF NOT EXISTS public.customer_retail_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers_retail(id) ON DELETE CASCADE,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_retail_preferences TO authenticated;
GRANT ALL ON public.customer_retail_preferences TO service_role;
ALTER TABLE public.customer_retail_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crp_read" ON public.customer_retail_preferences FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customers_retail c
  WHERE c.id = customer_id
    AND (public.is_staff_manager() OR c.store_id IS NULL OR public.staff_has_store(c.store_id))
));

CREATE POLICY "crp_insert" ON public.customer_retail_preferences FOR INSERT TO authenticated
WITH CHECK (public.is_staff_manager() OR public.is_staff());

CREATE POLICY "crp_update" ON public.customer_retail_preferences FOR UPDATE TO authenticated
USING (public.is_staff_manager() OR public.is_staff())
WITH CHECK (public.is_staff_manager() OR public.is_staff());

CREATE POLICY "crp_delete" ON public.customer_retail_preferences FOR DELETE TO authenticated
USING (public.is_staff_manager() OR public.is_staff());

CREATE TRIGGER trg_crp_updated_at BEFORE UPDATE ON public.customer_retail_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.customer_retail_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers_retail(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_retail_notes TO authenticated;
GRANT ALL ON public.customer_retail_notes TO service_role;
ALTER TABLE public.customer_retail_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crn_read" ON public.customer_retail_notes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customers_retail c
  WHERE c.id = customer_id
    AND (public.is_staff_manager() OR c.store_id IS NULL OR public.staff_has_store(c.store_id))
));

CREATE POLICY "crn_insert" ON public.customer_retail_notes FOR INSERT TO authenticated
WITH CHECK (public.is_staff_manager() OR public.is_staff());

CREATE POLICY "crn_update" ON public.customer_retail_notes FOR UPDATE TO authenticated
USING (public.is_staff_manager() OR created_by = auth.uid())
WITH CHECK (public.is_staff_manager() OR created_by = auth.uid());

CREATE POLICY "crn_delete" ON public.customer_retail_notes FOR DELETE TO authenticated
USING (public.is_staff_manager() OR created_by = auth.uid());

CREATE TRIGGER trg_crn_updated_at BEFORE UPDATE ON public.customer_retail_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS crp_customer_idx ON public.customer_retail_preferences(customer_id);
CREATE INDEX IF NOT EXISTS crn_customer_idx ON public.customer_retail_notes(customer_id);