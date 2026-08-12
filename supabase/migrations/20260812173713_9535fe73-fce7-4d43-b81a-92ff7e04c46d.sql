CREATE TABLE public.transformation_recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  output_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  yield_pct numeric NOT NULL DEFAULT 90 CHECK (yield_pct > 0 AND yield_pct <= 200),
  transform_type text NOT NULL DEFAULT 'kokning',
  surcharge_per_kg numeric NOT NULL DEFAULT 35,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_product_id, output_product_id, transform_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transformation_recipes TO authenticated;
GRANT ALL ON public.transformation_recipes TO service_role;

ALTER TABLE public.transformation_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan hantera omvandlingsrecept"
ON public.transformation_recipes FOR ALL TO authenticated
USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER trg_transformation_recipes_updated_at
BEFORE UPDATE ON public.transformation_recipes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();