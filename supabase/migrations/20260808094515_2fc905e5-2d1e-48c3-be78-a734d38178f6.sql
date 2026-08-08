ALTER TABLE public.cut_splits
  ADD COLUMN IF NOT EXISTS is_estimate boolean NOT NULL DEFAULT false;