ALTER TABLE public.shop_wishes
  ADD COLUMN IF NOT EXISTS published_to_wholesale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS shop_wishes_published_idx
  ON public.shop_wishes (published_to_wholesale, store_id);