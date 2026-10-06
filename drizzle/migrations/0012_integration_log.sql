CREATE TABLE public.integration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kalla text,
  action text,
  kall_id text,
  butik text,
  av text,
  data_sammanfattning text CHECK (data_sammanfattning IS NULL OR char_length(data_sammanfattning) <= 300),
  result text NOT NULL CHECK (result IN ('ok','granskning','fel','dubblett')),
  error text,
  duration_ms integer,
  svar jsonb
);
COMMENT ON COLUMN public.integration_log.svar IS 'Svaret som gavs första gången; returneras igen vid samma kall_id.';
CREATE UNIQUE INDEX integration_log_kall_id_uq ON public.integration_log (kall_id) WHERE kall_id IS NOT NULL AND result <> 'dubblett';
CREATE INDEX integration_log_created_idx ON public.integration_log (created_at DESC);
GRANT SELECT ON public.integration_log TO authenticated;
GRANT ALL ON public.integration_log TO service_role;
ALTER TABLE public.integration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser integrationslogg" ON public.integration_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));