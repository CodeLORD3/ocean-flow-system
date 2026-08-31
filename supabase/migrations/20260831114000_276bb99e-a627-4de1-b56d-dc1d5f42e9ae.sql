ALTER TABLE public.hr_notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE OR REPLACE FUNCTION public.hr_notifications_mark_read(_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.hr_notifications n
      SET read_at = now(), updated_at = now()
      WHERE n.channel = 'in_app'
        AND n.read_at IS NULL
        AND (_ids IS NULL OR n.id = ANY(_ids))
        AND (
          n.user_id = auth.uid()
          OR (n.employee_id IS NOT NULL AND public.employee_is_self(n.employee_id))
          OR (n.employee_id IS NOT NULL AND public.can_see_employee(n.employee_id))
        )
      RETURNING 1
  ) SELECT count(*)::int INTO _n FROM upd;
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.hr_notifications_mark_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_notifications_mark_read(uuid[]) TO authenticated;