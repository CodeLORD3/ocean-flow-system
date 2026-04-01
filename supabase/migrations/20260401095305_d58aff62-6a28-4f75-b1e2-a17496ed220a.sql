DELETE FROM payment_events;
DELETE FROM pledges;
DELETE FROM notifications WHERE entity_type IN ('pledge', 'payment');
UPDATE trade_offers SET status = 'Open', funded_amount = 0;