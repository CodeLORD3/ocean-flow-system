ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SEK',
  ADD COLUMN IF NOT EXISTS is_intercompany boolean NOT NULL DEFAULT false;

ALTER TABLE public.incoming_deliveries
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate_to_entity numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_date date,
  ADD COLUMN IF NOT EXISTS fx_source text,
  ADD COLUMN IF NOT EXISTS total_cost_source numeric;

ALTER TABLE public.incoming_delivery_lines
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS unit_cost_source numeric;

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS unit_cost_source numeric;

ALTER TABLE public.purchase_reports
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_date date,
  ADD COLUMN IF NOT EXISTS fx_source text,
  ADD COLUMN IF NOT EXISTS total_amount_source numeric;

ALTER TABLE public.purchase_report_lines
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS unit_price_source numeric,
  ADD COLUMN IF NOT EXISTS line_total_source numeric;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS unit_cost_source numeric;

UPDATE public.suppliers
   SET currency = 'SEK', is_intercompany = true
 WHERE name ILIKE '%Skaldjursspecialist%';