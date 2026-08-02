CREATE UNIQUE INDEX IF NOT EXISTS product_stock_locations_product_location_uidx
  ON public.product_stock_locations (product_id, location_id);