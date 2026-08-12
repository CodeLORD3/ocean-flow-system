ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shelf_life_open_days integer;
COMMENT ON COLUMN public.products.shelf_life_days IS 'Hållbarhet i dagar, sluten/oöppnad förpackning';
COMMENT ON COLUMN public.products.shelf_life_open_days IS 'Hållbarhet i dagar efter öppnad förpackning';