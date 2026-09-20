ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS parent_lot_id uuid REFERENCES public.lots(id),
  ADD COLUMN IF NOT EXISTS split_index integer;

CREATE INDEX IF NOT EXISTS lots_parent_lot_id_idx ON public.lots(parent_lot_id);