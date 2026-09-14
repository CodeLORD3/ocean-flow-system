CREATE TABLE public.transformation_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  target_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  label text NOT NULL,
  pack_size numeric,
  transform_kind text NOT NULL DEFAULT 'packa_om',
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transformation_presets TO authenticated;
GRANT ALL ON public.transformation_presets TO service_role;

ALTER TABLE public.transformation_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal hanterar snabbval" ON public.transformation_presets
  FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE INDEX idx_transformation_presets_source ON public.transformation_presets(source_product_id);

CREATE TRIGGER trg_transformation_presets_updated_at
  BEFORE UPDATE ON public.transformation_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();