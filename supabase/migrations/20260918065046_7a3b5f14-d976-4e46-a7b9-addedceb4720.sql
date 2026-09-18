ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS delivery_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_run_note text;

CREATE INDEX IF NOT EXISTS customer_orders_delivery_run_idx
  ON public.customer_orders (wanted_date) WHERE delivery_run_at IS NOT NULL;