
-- 1. Bind kassörer och transaktioner till butik
ALTER TABLE public.pos_cashiers
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_cashiers_store ON public.pos_cashiers(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_store ON public.pos_transactions(store_id);

-- 2. Säkerställ att lagerkoppling kan slås upp snabbt per butik
CREATE INDEX IF NOT EXISTS idx_storage_locations_store ON public.storage_locations(store_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_locations_loc ON public.product_stock_locations(location_id);

-- 3. Säkerställ att pos_products kan länkas till products för korrekt lagerlookup
CREATE INDEX IF NOT EXISTS idx_pos_products_erp ON public.pos_products(erp_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_sku ON public.pos_products(sku);
