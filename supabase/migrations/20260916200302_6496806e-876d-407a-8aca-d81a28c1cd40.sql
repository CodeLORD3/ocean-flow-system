CREATE TABLE public.production_recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'Produktion',
  batch_yield text,
  prep_minutes integer,
  temperature text,
  shelf_life_days integer,
  allergens text,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  tips text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_recipes_product ON public.production_recipes(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_recipes TO authenticated;
GRANT ALL ON public.production_recipes TO service_role;

ALTER TABLE public.production_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan hantera produktionsrecept"
ON public.production_recipes FOR ALL TO authenticated
USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER trg_production_recipes_updated_at
BEFORE UPDATE ON public.production_recipes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();