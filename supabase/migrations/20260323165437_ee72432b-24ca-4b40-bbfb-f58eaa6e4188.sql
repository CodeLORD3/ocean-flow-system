
INSERT INTO storage.buckets (id, name, public) VALUES ('trade-offers', 'trade-offers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read trade-offers" ON storage.objects FOR SELECT TO public USING (bucket_id = 'trade-offers');
CREATE POLICY "Authenticated upload trade-offers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'trade-offers');
CREATE POLICY "Authenticated delete trade-offers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'trade-offers');
