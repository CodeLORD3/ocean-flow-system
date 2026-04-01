CREATE OR REPLACE FUNCTION public.generate_payment_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.payment_reference := 'OT-' || EXTRACT(YEAR FROM now())::text || '-' || LEFT(NEW.user_id::text, 6) || '-' || LEFT(NEW.offer_id::text, 6) || '-' || LEFT(NEW.id::text, 4);
  RETURN NEW;
END;
$function$;