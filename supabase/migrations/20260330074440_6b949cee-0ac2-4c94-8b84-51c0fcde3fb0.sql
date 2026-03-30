
CREATE POLICY "Public delete investor_profiles" ON public.investor_profiles
  FOR DELETE TO public USING (true);
