CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING ((user_id = auth.uid()) OR (user_id IS NULL));