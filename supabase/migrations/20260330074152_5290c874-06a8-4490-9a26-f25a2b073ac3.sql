
-- Allow public insert on investor_profiles for admin-created profiles (pre-launch)
CREATE POLICY "Public insert investor_profiles" ON public.investor_profiles
  FOR INSERT TO public WITH CHECK (true);

-- Allow public update on investor_profiles for admin status changes
CREATE POLICY "Public update investor_profiles" ON public.investor_profiles
  FOR UPDATE TO public USING (true);

-- Allow public select on investor_profiles for admin views
CREATE POLICY "Public select investor_profiles" ON public.investor_profiles
  FOR SELECT TO public USING (true);

-- Allow public insert on pledges for demo investor funding
CREATE POLICY "Public insert pledges" ON public.pledges
  FOR INSERT TO public WITH CHECK (true);

-- Allow public update on pledges
CREATE POLICY "Public update pledges" ON public.pledges
  FOR UPDATE TO public USING (true);
