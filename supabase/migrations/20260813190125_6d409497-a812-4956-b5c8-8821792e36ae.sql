ALTER TABLE public.customer_orders DROP CONSTRAINT customer_orders_source_check;
ALTER TABLE public.customer_orders
  ADD CONSTRAINT customer_orders_source_check
  CHECK (source = ANY (ARRAY['telefon'::text, 'i_butik'::text, 'epost'::text, 'shopify'::text]));