DROP POLICY IF EXISTS co_read ON public.customer_orders;
CREATE POLICY co_read ON public.customer_orders FOR SELECT TO authenticated
USING (is_staff_manager() OR staff_has_store(store_id));

DROP POLICY IF EXISTS col_read ON public.customer_order_lines;
CREATE POLICY col_read ON public.customer_order_lines FOR SELECT TO authenticated
USING (is_staff_manager() OR EXISTS (
  SELECT 1 FROM public.customer_orders o
  WHERE o.id = customer_order_lines.customer_order_id AND staff_has_store(o.store_id)
));

DROP POLICY IF EXISTS coe_read ON public.customer_order_events;
CREATE POLICY coe_read ON public.customer_order_events FOR SELECT TO authenticated
USING (is_staff_manager() OR EXISTS (
  SELECT 1 FROM public.customer_orders o
  WHERE o.id = customer_order_events.customer_order_id AND staff_has_store(o.store_id)
));