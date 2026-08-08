DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Staff can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());