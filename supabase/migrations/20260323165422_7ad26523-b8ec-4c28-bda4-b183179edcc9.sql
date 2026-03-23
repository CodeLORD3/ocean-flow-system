
ALTER TABLE public.trade_offers
  ADD COLUMN IF NOT EXISTS min_pledge numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_pledge numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS purchase_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repayment_type text DEFAULT 'lump_sum',
  ADD COLUMN IF NOT EXISTS supplier_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS product_image_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_note text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS document_url text DEFAULT NULL;
