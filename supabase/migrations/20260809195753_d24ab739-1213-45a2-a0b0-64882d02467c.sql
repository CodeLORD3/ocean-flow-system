ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS may_contain text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS allergens_checked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.allergens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allergens TO authenticated;
GRANT ALL ON public.allergens TO service_role;

ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan läsa allergener"
  ON public.allergens FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Ansvariga kan ändra allergener"
  ON public.allergens FOR ALL TO authenticated
  USING (public.is_staff_manager())
  WITH CHECK (public.is_staff_manager());

CREATE TRIGGER trg_allergens_updated
  BEFORE UPDATE ON public.allergens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.allergens (code, label, sort_order) VALUES
  ('gluten', 'Spannmål som innehåller gluten', 1),
  ('skaldjur', 'Kräftdjur', 2),
  ('agg', 'Ägg', 3),
  ('fisk', 'Fisk', 4),
  ('jordnotter', 'Jordnötter', 5),
  ('soja', 'Sojabönor', 6),
  ('mjolk', 'Mjölk', 7),
  ('notter', 'Nötter', 8),
  ('selleri', 'Selleri', 9),
  ('senap', 'Senap', 10),
  ('sesam', 'Sesamfrön', 11),
  ('sulfit', 'Svaveldioxid och sulfit', 12),
  ('lupin', 'Lupin', 13),
  ('blotdjur', 'Blötdjur', 14)
ON CONFLICT (code) DO NOTHING;