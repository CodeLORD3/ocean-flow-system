CREATE TABLE public.report_email_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT ARRAY['baldvin@fiskskaldjur.se','caisa@fiskskaldjur.se'],
  sender text NOT NULL DEFAULT 'rapport@fiskskaldjur.se',
  sender_name text NOT NULL DEFAULT 'Makrill Trade',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.report_email_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.report_email_settings TO authenticated;
GRANT ALL ON public.report_email_settings TO service_role;
ALTER TABLE public.report_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser rapportinställningar" ON public.report_email_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_platform_admin(auth.uid()));
CREATE POLICY "Admin ändrar rapportinställningar" ON public.report_email_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_platform_admin(auth.uid()));

CREATE TABLE public.report_email_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('daglig','lordag','sondag')),
  report_date date NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'startad' CHECK (status IN ('startad','lyckad','misslyckad','ej_skickad','hoppad')),
  stores_expected integer,
  stores_reported integer,
  missing_stores text[],
  recipients text[],
  html text,
  error_stage text,
  error text,
  resend_message_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX report_email_runs_once ON public.report_email_runs (report_type, report_date) WHERE status = 'lyckad' AND NOT is_test;
CREATE INDEX report_email_runs_started ON public.report_email_runs (started_at DESC);
GRANT SELECT ON public.report_email_runs TO authenticated;
GRANT ALL ON public.report_email_runs TO service_role;
ALTER TABLE public.report_email_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser rapportkörningar" ON public.report_email_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_platform_admin(auth.uid()));