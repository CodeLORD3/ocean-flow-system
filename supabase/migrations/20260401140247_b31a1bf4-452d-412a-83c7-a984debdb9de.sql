
CREATE OR REPLACE FUNCTION public.notify_new_pledge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  offer_title text;
  investor_name text;
  pledge_amount numeric;
  company_country text;
  currency_code text;
  formatted_amount text;
BEGIN
  -- Get offer title and company country
  SELECT t.title, COALESCE(c.country, 'Sweden')
  INTO offer_title, company_country
  FROM public.trade_offers t
  LEFT JOIN public.companies c ON c.id = t.company_id
  WHERE t.id = NEW.offer_id;

  SELECT first_name || ' ' || last_name INTO investor_name
  FROM public.investor_profiles WHERE user_id = NEW.user_id;

  pledge_amount := NEW.amount;

  -- Derive currency from company country
  IF lower(trim(company_country)) IN ('switzerland', 'ch', 'schweiz', 'suisse') THEN
    currency_code := 'CHF';
  ELSIF lower(trim(company_country)) IN ('germany', 'de', 'france', 'fr', 'italy', 'it', 'spain', 'es', 'netherlands', 'nl') THEN
    currency_code := 'EUR';
  ELSIF lower(trim(company_country)) IN ('united states', 'us', 'usa') THEN
    currency_code := 'USD';
  ELSE
    currency_code := 'SEK';
  END IF;

  -- Format amount with space-separated thousands (e.g. 50000 -> 50 000)
  formatted_amount := trim(to_char(pledge_amount, '999 999 999 999'));

  -- Notification for the specific investor
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id, user_id)
  VALUES ('investor', '/portal/portfolio',
    'Your investment of ' || formatted_amount || ' ' || currency_code || ' in ' || COALESCE(offer_title, 'an offer') || ' has been confirmed.',
    'pledge', NEW.id::text, NEW.user_id);

  -- Notification for admin backend
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('trade', '/investment-log',
    COALESCE(investor_name, 'An investor') || ' invested ' || formatted_amount || ' ' || currency_code || ' in ' || COALESCE(offer_title, 'an offer'),
    'pledge', NEW.id::text);

  RETURN NEW;
END;
$function$;
