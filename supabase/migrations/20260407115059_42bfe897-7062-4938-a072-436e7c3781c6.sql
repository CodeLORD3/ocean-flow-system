
CREATE TABLE public.shop_wishes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  category text NOT NULL DEFAULT 'Butik',
  status text NOT NULL DEFAULT 'Inget',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_wishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access shop_wishes" ON public.shop_wishes
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);
