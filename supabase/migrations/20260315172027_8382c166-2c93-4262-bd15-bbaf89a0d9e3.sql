
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  portal text NOT NULL DEFAULT 'wholesale',
  action_type text NOT NULL,
  description text NOT NULL,
  entity_type text,
  entity_id text,
  performed_by text,
  details jsonb
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_activity_logs_store_id ON public.activity_logs(store_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_portal ON public.activity_logs(portal);
