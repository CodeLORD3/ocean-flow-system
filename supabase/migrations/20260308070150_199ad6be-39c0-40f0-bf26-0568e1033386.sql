
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- Seed with default categories
INSERT INTO public.categories (name) VALUES
  ('Färsk Fisk'),
  ('Skaldjur'),
  ('Varmkök'),
  ('Rökta Produkter'),
  ('Såser & Röror'),
  ('Frukt & Grönt');
