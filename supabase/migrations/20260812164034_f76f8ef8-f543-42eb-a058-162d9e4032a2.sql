ALTER TABLE public.customer_order_lines
  ADD COLUMN IF NOT EXISTS cost_at_order numeric,
  ADD COLUMN IF NOT EXISTS cost_source_at_order text;

ALTER TABLE public.shop_order_lines
  ADD COLUMN IF NOT EXISTS cost_at_order numeric,
  ADD COLUMN IF NOT EXISTS cost_source_at_order text;

COMMENT ON COLUMN public.customer_order_lines.cost_at_order IS 'Låst inköps-/dagspris per enhet vid ordertillfället. Räknas aldrig om.';
COMMENT ON COLUMN public.customer_order_lines.cost_source_at_order IS 'day_price eller cost_price — vilken priskälla som gällde vid ordertillfället.';
COMMENT ON COLUMN public.shop_order_lines.cost_at_order IS 'Låst inköps-/dagspris per enhet vid ordertillfället. Räknas aldrig om.';
COMMENT ON COLUMN public.shop_order_lines.cost_source_at_order IS 'day_price eller cost_price — vilken priskälla som gällde vid ordertillfället.';