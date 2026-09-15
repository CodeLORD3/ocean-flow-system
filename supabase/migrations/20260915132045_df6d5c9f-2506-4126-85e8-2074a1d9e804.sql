DROP TRIGGER IF EXISTS trg_customer_order_calendar ON public.customer_orders;
DROP FUNCTION IF EXISTS public.sync_customer_order_calendar();
DELETE FROM public.schedule_events WHERE customer_order_id IS NOT NULL;