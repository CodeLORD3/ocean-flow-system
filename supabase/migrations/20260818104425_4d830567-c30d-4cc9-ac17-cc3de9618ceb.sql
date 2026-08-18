CREATE POLICY "pk_costgroups_manual_insert" ON public.pk_costgroups FOR INSERT TO authenticated WITH CHECK (public.pk_can_read_salary());
GRANT INSERT ON public.pk_costgroups TO authenticated;