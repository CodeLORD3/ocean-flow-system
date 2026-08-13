-- Kvantitetsfältet ska alltid stå i produktens egen enhet: antal för styckprodukter.
-- Ostronraden bokfördes i kilo (408 st × 0,1 kg) medan priset var per styck.
UPDATE public.lots
   SET quantity_kg = 408,
       updated_at = now()
 WHERE lot_number = 'IL-FSAB-2026-0098'
   AND quantity_kg = 40.800;

INSERT INTO public.stock_movements (
  product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
  reference_type, reference_id, note
)
SELECT l.product_id,
       'bc20731d-aacc-448f-a988-8a36bfac9735'::uuid,
       l.id,
       'justering',
       367.200,
       8.00,
       'enhetsrattelse',
       l.id,
       'Enhetsrättelse: ostron bokfördes som 40,8 kg men priset 8 kr är per styck. Saldot rättas till 408 st.'
  FROM public.lots l
 WHERE l.lot_number = 'IL-FSAB-2026-0098';