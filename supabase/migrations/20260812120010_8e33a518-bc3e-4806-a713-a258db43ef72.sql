ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS hourly_rate numeric;

CREATE TABLE public.staff_shift_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.staff_shift_edits TO authenticated;
GRANT ALL ON public.staff_shift_edits TO service_role;

ALTER TABLE public.staff_shift_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read shift edits"
  ON public.staff_shift_edits FOR SELECT TO authenticated
  USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can log shift edits"
  ON public.staff_shift_edits FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_staff());

CREATE INDEX idx_staff_shift_edits_shift ON public.staff_shift_edits (shift_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shift_edits;