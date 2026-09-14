CREATE TABLE public.product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_unit text NOT NULL DEFAULT 'kg',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_families TO authenticated;
GRANT ALL ON public.product_families TO service_role;

ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read product families"
  ON public.product_families FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Staff managers can manage product families"
  ON public.product_families FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE TRIGGER update_product_families_updated_at
  BEFORE UPDATE ON public.product_families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products
  ADD COLUMN family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL;

CREATE INDEX idx_products_family_id ON public.products(family_id);
CREATE UNIQUE INDEX idx_product_families_name ON public.product_families(lower(name));