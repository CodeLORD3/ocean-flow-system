-- Link POS lax products to existing ERP lax products
UPDATE public.pos_products 
SET erp_id = '0ff0d9f0-6f1a-4e3e-9d5d-ed7e30711302'  -- LAX-001 (Lax)
WHERE sku = 'FF-001';

UPDATE public.pos_products 
SET erp_id = '0f659170-1371-46c6-9579-09dd518a5146'  -- LAX-001-FIL-BAS (Laxfilé Basic)
WHERE sku = 'FF-002';

-- Seed stock for Stockholm store (Pre-Stockholm location)
INSERT INTO public.product_stock_locations (product_id, location_id, quantity, unit_cost)
VALUES 
  ('0ff0d9f0-6f1a-4e3e-9d5d-ed7e30711302', '6ef28263-b51e-4d86-b646-9fc0cc5df5ff', 25, 122.50),
  ('0f659170-1371-46c6-9579-09dd518a5146', '6ef28263-b51e-4d86-b646-9fc0cc5df5ff', 15, 191.10)
ON CONFLICT DO NOTHING;