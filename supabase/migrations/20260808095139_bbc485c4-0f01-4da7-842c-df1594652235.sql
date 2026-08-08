DROP POLICY IF EXISTS "anon_read_trade_offers" ON public.trade_offers;
DROP POLICY IF EXISTS "Public read offers" ON public.trade_offers;
REVOKE ALL ON public.trade_offers, public.offer_documents FROM anon;