
ALTER TABLE public.trade_offers
  ADD COLUMN IF NOT EXISTS product_id_display text,
  ADD COLUMN IF NOT EXISTS sector text DEFAULT 'Seafood Trading',
  ADD COLUMN IF NOT EXISTS structure text DEFAULT 'Trade Finance',
  ADD COLUMN IF NOT EXISTS tenor_days integer,
  ADD COLUMN IF NOT EXISTS annual_return numeric,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS volume text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_margin numeric,
  ADD COLUMN IF NOT EXISTS collateral text DEFAULT 'Inventory',
  ADD COLUMN IF NOT EXISTS ltv numeric,
  ADD COLUMN IF NOT EXISTS primary_exit text,
  ADD COLUMN IF NOT EXISTS secondary_exit text,
  ADD COLUMN IF NOT EXISTS downside text;
