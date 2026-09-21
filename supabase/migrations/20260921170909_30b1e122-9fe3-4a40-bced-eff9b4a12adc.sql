ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_lead_days smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.purchase_lead_days IS 'Antal dagar före leveransdagen som varan måste köpas in. 0 = köps samma dag. 1 = kokas/filéas och köps dagen innan.';

UPDATE public.products
   SET purchase_lead_days = 1
 WHERE purchase_lead_days = 0
   AND (
        requires_processing = true
     OR (category = 'Skaldjur' AND (
            name ILIKE '%kräft%'
         OR name ILIKE '%kok%'
         OR name ILIKE '%filé%'
         OR name ILIKE '%skalad%'
         OR name ILIKE '%rensad%'
        ))
   );