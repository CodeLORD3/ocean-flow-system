
CREATE OR REPLACE FUNCTION public.notify_new_pledge()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  offer_title text;
  investor_name text;
  pledge_amount numeric;
BEGIN
  -- Get offer title
  SELECT title INTO offer_title FROM public.trade_offers WHERE id = NEW.offer_id;
  
  -- Get investor name
  SELECT first_name || ' ' || last_name INTO investor_name
  FROM public.investor_profiles WHERE user_id = NEW.user_id;
  
  pledge_amount := NEW.amount;

  -- Notification for investor portal (My Investments)
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('investor', '/portal/portfolio',
    'Your investment of ' || pledge_amount::text || ' kr in ' || COALESCE(offer_title, 'an offer') || ' has been confirmed.',
    'pledge', NEW.id::text);

  -- Notification for backend (Investment Log)
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('trade', '/investment-log',
    COALESCE(investor_name, 'An investor') || ' invested ' || pledge_amount::text || ' kr in ' || COALESCE(offer_title, 'an offer'),
    'pledge', NEW.id::text);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_new_pledge
  AFTER INSERT ON public.pledges
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_pledge();
