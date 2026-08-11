
DROP POLICY IF EXISTS cr_insert ON public.customers_retail;
DROP POLICY IF EXISTS cr_read ON public.customers_retail;
DROP POLICY IF EXISTS cr_update ON public.customers_retail;
CREATE POLICY cr_insert ON public.customers_retail FOR INSERT TO authenticated WITH CHECK (is_staff_manager() OR is_staff());
CREATE POLICY cr_read ON public.customers_retail FOR SELECT TO authenticated USING (is_staff_manager() OR store_id IS NULL OR staff_has_store(store_id));
CREATE POLICY cr_update ON public.customers_retail FOR UPDATE TO authenticated USING (is_staff_manager() OR store_id IS NULL OR staff_has_store(store_id)) WITH CHECK (is_staff_manager() OR is_staff());

DROP POLICY IF EXISTS co_insert ON public.customer_orders;
DROP POLICY IF EXISTS co_read ON public.customer_orders;
DROP POLICY IF EXISTS co_update ON public.customer_orders;
CREATE POLICY co_insert ON public.customer_orders FOR INSERT TO authenticated WITH CHECK (is_staff_manager() OR is_staff());
CREATE POLICY co_read ON public.customer_orders FOR SELECT TO authenticated USING (is_staff_manager() OR store_id IS NULL OR staff_has_store(store_id));
CREATE POLICY co_update ON public.customer_orders FOR UPDATE TO authenticated USING (is_staff_manager() OR store_id IS NULL OR staff_has_store(store_id)) WITH CHECK (is_staff_manager() OR is_staff());

DROP POLICY IF EXISTS col_write ON public.customer_order_lines;
DROP POLICY IF EXISTS col_read ON public.customer_order_lines;
CREATE POLICY col_read ON public.customer_order_lines FOR SELECT TO authenticated USING (
  is_staff_manager() OR EXISTS (
    SELECT 1 FROM customer_orders o
    WHERE o.id = customer_order_lines.customer_order_id
      AND (o.store_id IS NULL OR staff_has_store(o.store_id))
  )
);
CREATE POLICY col_write ON public.customer_order_lines FOR ALL TO authenticated USING (is_staff_manager() OR is_staff()) WITH CHECK (is_staff_manager() OR is_staff());
