ALTER TABLE public.store_order_settings
  ADD COLUMN IF NOT EXISTS require_web_pickup_approval boolean NOT NULL DEFAULT false;