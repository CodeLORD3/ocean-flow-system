-- Beständig anteckning på en vara, per butik. Syns nästa gång någon räknar varan.
CREATE TABLE IF NOT EXISTS public.product_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_notes TO authenticated;
GRANT ALL ON public.product_notes TO service_role;

ALTER TABLE public.product_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal ser anteckningar i sina butiker"
ON public.product_notes FOR SELECT TO authenticated
USING (public.can_see_store(store_id));

CREATE POLICY "Personal skriver anteckningar i sina butiker"
ON public.product_notes FOR INSERT TO authenticated
WITH CHECK (public.can_see_store(store_id));

CREATE POLICY "Personal ändrar anteckningar i sina butiker"
ON public.product_notes FOR UPDATE TO authenticated
USING (public.can_see_store(store_id))
WITH CHECK (public.can_see_store(store_id));

CREATE POLICY "Personal tar bort anteckningar i sina butiker"
ON public.product_notes FOR DELETE TO authenticated
USING (public.can_see_store(store_id));