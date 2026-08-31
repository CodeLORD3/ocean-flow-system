DROP FUNCTION IF EXISTS public.hr_notifications_mark_read(uuid[]);

CREATE POLICY "hr_notifications_mark_own_read" ON public.hr_notifications
  FOR UPDATE TO authenticated
  USING (
    channel = 'in_app'
    AND (
      user_id = auth.uid()
      OR (employee_id IS NOT NULL AND public.employee_is_self(employee_id))
    )
  )
  WITH CHECK (
    channel = 'in_app'
    AND (
      user_id = auth.uid()
      OR (employee_id IS NOT NULL AND public.employee_is_self(employee_id))
    )
  );

REVOKE UPDATE ON public.hr_notifications FROM authenticated;
GRANT UPDATE (read_at, updated_at) ON public.hr_notifications TO authenticated;