CREATE OR REPLACE FUNCTION public.anonymize_retail_customer(_customer_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  orders_touched integer := 0;
  sms_touched integer := 0;
  cust record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Bara admin får radera kunduppgifter.';
  END IF;

  SELECT * INTO cust FROM public.customers_retail WHERE id = _customer_id;
  IF cust.id IS NULL THEN
    RAISE EXCEPTION 'Kunden finns inte.';
  END IF;

  UPDATE public.sms_log s
     SET phone_normalized = NULL
   WHERE s.customer_order_id IN (SELECT id FROM public.customer_orders WHERE customer_id = _customer_id);
  GET DIAGNOSTICS sms_touched = ROW_COUNT;

  UPDATE public.customer_orders
     SET customer_name_snapshot = 'Raderad kund',
         customer_phone_snapshot = NULL
   WHERE customer_id = _customer_id;
  GET DIAGNOSTICS orders_touched = ROW_COUNT;

  UPDATE public.customers_retail
     SET name = 'Raderad kund',
         first_name = NULL,
         last_name = NULL,
         phone = NULL,
         phone_normalized = NULL,
         email = NULL,
         email_normalized = NULL,
         street = NULL,
         postal_code = NULL,
         note = NULLIF(TRIM(COALESCE('Raderad på begäran. ' || COALESCE(_reason, ''), '')), ''),
         contact_reference = NULL,
         shopify_customer_id = NULL,
         anonymized_at = now()
   WHERE id = _customer_id;

  INSERT INTO public.activity_logs (portal, action_type, description, entity_type, entity_id, store_id, details)
  VALUES ('admin', 'delete', 'Kunduppgifter raderade på begäran (GDPR)', 'customers_retail', _customer_id::text, cust.store_id,
          jsonb_build_object('reason', _reason, 'orders_anonymized', orders_touched, 'sms_rows_cleared', sms_touched));

  RETURN jsonb_build_object('ok', true, 'orders_anonymized', orders_touched, 'sms_rows_cleared', sms_touched);
END;
$function$;