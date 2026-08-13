ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;

CREATE INDEX IF NOT EXISTS customer_orders_archived_at_idx ON public.customer_orders (archived_at);