ALTER TABLE public.products ADD COLUMN IF NOT EXISTS latin_name text;

ALTER TABLE public.incoming_delivery_lines
  ADD COLUMN IF NOT EXISTS redskapskategori text,
  ADD COLUMN IF NOT EXISTS upptinad boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS faktiskt_fangstomrade text;

ALTER TABLE public.incoming_delivery_lines
  ADD CONSTRAINT incoming_delivery_lines_redskapskategori_check
  CHECK (redskapskategori IS NULL OR redskapskategori IN ('Not/vad','Trål','Garn','Ringnot','Krok och lina','Skrapredskap','Bur och fälla'));