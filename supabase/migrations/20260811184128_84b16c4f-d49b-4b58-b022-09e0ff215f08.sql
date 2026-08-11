CREATE TABLE public.bug_report_states (
  log_id uuid PRIMARY KEY REFERENCES public.activity_logs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new',
  note text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bug_report_states TO authenticated;
GRANT ALL ON public.bug_report_states TO service_role;

ALTER TABLE public.bug_report_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read bug report states"
ON public.bug_report_states FOR SELECT TO authenticated
USING (public.is_staff());

CREATE POLICY "Staff can insert bug report states"
ON public.bug_report_states FOR INSERT TO authenticated
WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update bug report states"
ON public.bug_report_states FOR UPDATE TO authenticated
USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Staff can delete bug report states"
ON public.bug_report_states FOR DELETE TO authenticated
USING (public.is_staff());

CREATE TRIGGER bug_report_states_updated_at
BEFORE UPDATE ON public.bug_report_states
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_bug_report_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('new', 'done', 'irrelevant', 'planned', 'duplicate') THEN
    RAISE EXCEPTION 'Ogiltig status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bug_report_states_validate
BEFORE INSERT OR UPDATE ON public.bug_report_states
FOR EACH ROW EXECUTE FUNCTION public.validate_bug_report_status();