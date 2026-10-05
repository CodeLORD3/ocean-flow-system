CREATE POLICY "shifts store colleagues read published" ON public.shifts
FOR SELECT TO authenticated
USING (status = 'published' AND store_id IN (SELECT public.my_employee_store_ids()));