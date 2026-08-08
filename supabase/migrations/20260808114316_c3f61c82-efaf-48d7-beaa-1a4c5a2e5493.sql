CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT INSERT, UPDATE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read system settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Managers can insert system settings"
  ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_manager());

CREATE POLICY "Managers can update system settings"
  ON public.system_settings FOR UPDATE TO authenticated
  USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

CREATE TRIGGER trg_system_settings_updated
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.system_settings (key, value)
VALUES ('picklist_alarm', '{"hours": 4}'::jsonb);