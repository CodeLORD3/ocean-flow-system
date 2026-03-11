
-- Fix current order line statuses to match Pre-stock availability
UPDATE shop_order_lines SET status = 'Packad' 
WHERE id IN ('f09794bf-7a64-4d63-9f26-28179210e587', '0359d9ab-ccdd-4280-adc9-b54d7eab4230');

-- Fix order status
UPDATE shop_orders SET status = 'Packad' WHERE id = 'a3017c90-de0e-47b2-8166-4ef5c9953fa1';
