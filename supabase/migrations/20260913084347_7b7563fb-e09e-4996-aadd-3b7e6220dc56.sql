ALTER TABLE public.stock_count_sessions
  DROP CONSTRAINT IF EXISTS stock_count_sessions_store_id_count_date_key;

ALTER TABLE public.stock_count_sessions
  ADD COLUMN IF NOT EXISTS label text;

CREATE UNIQUE INDEX IF NOT EXISTS stock_count_sessions_one_open_per_day
  ON public.stock_count_sessions (store_id, count_date)
  WHERE status = 'open';