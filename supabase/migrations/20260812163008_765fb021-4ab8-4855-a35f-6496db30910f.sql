-- 1. Återställ partipriser som fastnat på standardpriset 1 kr/kg
WITH bad AS (
  SELECT id, product_id, quantity_kg, created_at
  FROM public.lots
  WHERE COALESCE(unit_cost, 0) <= 1
), best AS (
  SELECT b.id AS lot_id,
         (SELECT prl.unit_price
            FROM public.purchase_report_lines prl
           WHERE prl.product_id = b.product_id
             AND prl.quantity = b.quantity_kg
             AND prl.unit_price > 1
           ORDER BY abs(EXTRACT(EPOCH FROM (prl.created_at - b.created_at)))
           LIMIT 1) AS price
  FROM bad b
)
UPDATE public.lots l
   SET unit_cost = best.price, updated_at = now()
  FROM best
 WHERE l.id = best.lot_id AND best.price IS NOT NULL;

-- 2. Låt varje lagerrörelse med parti bära partiets bokförda pris
UPDATE public.stock_movements m
   SET unit_cost = l.unit_cost
  FROM public.lots l
 WHERE m.lot_id = l.id
   AND l.unit_cost IS NOT NULL
   AND l.unit_cost > 0
   AND COALESCE(m.unit_cost, 0) <> l.unit_cost;

-- 3. Räkna om lagervärde per lagerplats utifrån kvarvarande partier
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.stock_ledger', 'on', true);
  FOR r IN
    WITH lot_bal AS (
      SELECT m.product_id, m.location_id, m.lot_id,
             SUM(m.quantity_kg) AS qty,
             MAX(l.unit_cost) AS lot_cost
        FROM public.stock_movements m
        LEFT JOIN public.lots l ON l.id = m.lot_id
       GROUP BY m.product_id, m.location_id, m.lot_id
    ), pos AS (
      SELECT * FROM lot_bal WHERE qty > 0
    )
    SELECT p.product_id, p.location_id,
           SUM(p.qty) AS qty,
           SUM(p.qty * COALESCE(p.lot_cost, 0)) AS value
      FROM pos p
     GROUP BY p.product_id, p.location_id
  LOOP
    UPDATE public.product_stock_locations psl
       SET avg_cost = CASE WHEN r.qty > 0 THEN ROUND(r.value / r.qty, 2) ELSE 0 END,
           unit_cost = CASE WHEN r.qty > 0 THEN ROUND(r.value / r.qty, 2) ELSE 0 END,
           stock_value = ROUND(r.value, 2),
           updated_at = now()
     WHERE psl.product_id = r.product_id
       AND psl.location_id = r.location_id
       AND psl.quantity > 0;
  END LOOP;
  PERFORM set_config('app.stock_ledger', 'off', true);
END $$;