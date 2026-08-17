ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS needs_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE INDEX IF NOT EXISTS customer_orders_needs_approval_idx
  ON public.customer_orders (store_id) WHERE needs_approval AND approved_at IS NULL;