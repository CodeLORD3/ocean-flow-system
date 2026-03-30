
ALTER TABLE public.trade_offers
  ADD COLUMN IF NOT EXISTS company_iban text,
  ADD COLUMN IF NOT EXISTS payment_reference_prefix text DEFAULT 'OT-';
