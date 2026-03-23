
-- Allow public insert/update on trade_offers (matches ERP pattern used by all other tables)
CREATE POLICY "Public insert trade_offers" ON public.trade_offers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update trade_offers" ON public.trade_offers FOR UPDATE TO public USING (true);
CREATE POLICY "Public delete trade_offers" ON public.trade_offers FOR DELETE TO public USING (true);
