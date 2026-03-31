-- Add user_id to notifications for investor-specific filtering
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid;

-- Update the notify_new_pledge trigger to include user_id
CREATE OR REPLACE FUNCTION public.notify_new_pledge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  offer_title text;
  investor_name text;
  pledge_amount numeric;
BEGIN
  SELECT title INTO offer_title FROM public.trade_offers WHERE id = NEW.offer_id;
  SELECT first_name || ' ' || last_name INTO investor_name
  FROM public.investor_profiles WHERE user_id = NEW.user_id;
  pledge_amount := NEW.amount;

  -- Notification for the specific investor
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id, user_id)
  VALUES ('investor', '/portal/portfolio',
    'Your investment of ' || pledge_amount::text || ' kr in ' || COALESCE(offer_title, 'an offer') || ' has been confirmed.',
    'pledge', NEW.id::text, NEW.user_id);

  -- Notification for admin backend
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('trade', '/investment-log',
    COALESCE(investor_name, 'An investor') || ' invested ' || pledge_amount::text || ' kr in ' || COALESCE(offer_title, 'an offer'),
    'pledge', NEW.id::text);

  RETURN NEW;
END;
$function$;