CREATE TABLE public.mcp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  agent text,
  tool text NOT NULL,
  args_summary text CHECK (char_length(args_summary) <= 300),
  result text NOT NULL CHECK (result IN ('ok','fel')),
  error text,
  duration_ms integer,
  ai_uppgift_id bigint
);
GRANT SELECT, INSERT ON public.mcp_calls TO authenticated;
GRANT ALL ON public.mcp_calls TO service_role;
ALTER TABLE public.mcp_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcp_calls admin läser" ON public.mcp_calls FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_platform_admin(auth.uid()));
CREATE POLICY "mcp_calls egen rad" ON public.mcp_calls FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX mcp_calls_created_idx ON public.mcp_calls (created_at DESC);

ALTER TABLE public.ai_uppgifter ADD COLUMN IF NOT EXISTS uppdaterad_av text;
ALTER TABLE public.ai_utkast ADD COLUMN IF NOT EXISTS uppdaterad_av text;

CREATE OR REPLACE FUNCTION public.ai_set_uppdaterad_av() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.uppdaterad_av := coalesce(public._actor_name(), 'okänd')
    || CASE WHEN (auth.jwt() ->> 'client_id') IS NOT NULL THEN ' (MCP)' ELSE '' END;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_uppgifter_uppdaterad_av BEFORE UPDATE ON public.ai_uppgifter
  FOR EACH ROW EXECUTE FUNCTION public.ai_set_uppdaterad_av();
CREATE TRIGGER ai_utkast_uppdaterad_av BEFORE UPDATE ON public.ai_utkast
  FOR EACH ROW EXECUTE FUNCTION public.ai_set_uppdaterad_av();

CREATE OR REPLACE FUNCTION public.attest_weekly_reminder()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _week text := to_char((now() AT TIME ZONE 'Europe/Stockholm')::date, 'IYYY-"W"IW');
  _created integer := 0;
  _admin integer := 0;
BEGIN
  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, dedupe_key)
  SELECT 'shop', '/attestations', a.store_id,
         'Oattesterade pass äldre än 7 dagar: ' || count(*) || ' rader väntar på attest',
         'attestation',
         'attest_reminder|' || a.store_id || '|' || _week
  FROM public.attestations a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE a.status = 'flagged' AND e.is_test = false
    AND a.date < ((now() AT TIME ZONE 'Europe/Stockholm')::date - 7)
    AND a.store_id IS NOT NULL
  GROUP BY a.store_id
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS _created = ROW_COUNT;

  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, dedupe_key)
  SELECT 'admin', '/attestations', a.store_id,
         'Eskalering: ' || count(*) || ' oattesterade pass äldre än 7 dagar (' || coalesce(s.name,'okänd enhet') || ')',
         'attestation',
         'attest_escalation|' || a.store_id || '|' || _week
  FROM public.attestations a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.stores s ON s.id = a.store_id
  WHERE a.status = 'flagged' AND e.is_test = false
    AND a.date < ((now() AT TIME ZONE 'Europe/Stockholm')::date - 7)
    AND a.store_id IS NOT NULL
  GROUP BY a.store_id, s.name
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS _admin = ROW_COUNT;

  RETURN _created + _admin;
END;
$function$;