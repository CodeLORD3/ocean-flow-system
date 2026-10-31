CREATE TABLE public.fortnox_inbox_scan_state (
 legal_entity_code text PRIMARY KEY,
 state jsonb NOT NULL DEFAULT '{"folders":[],"files":[]}'::jsonb,
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.fortnox_inbox_scan_state TO service_role;
ALTER TABLE public.fortnox_inbox_scan_state ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.claim_fortnox_inbox_scan(_entity text, _token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE result jsonb;
BEGIN
 INSERT INTO public.fortnox_inbox_scan_state(legal_entity_code) VALUES (_entity) ON CONFLICT DO NOTHING;
 UPDATE public.fortnox_inbox_scan_state SET lease_token = _token, lease_until = now() + interval '15 minutes', updated_at = now()
 WHERE legal_entity_code = _entity AND (lease_until IS NULL OR lease_until < now()) RETURNING state INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_fortnox_inbox_scan(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fortnox_inbox_scan(text,uuid) TO service_role;

CREATE FUNCTION public.checkpoint_fortnox_inbox_scan(_entity text, _token uuid, _state jsonb, _release boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
 UPDATE public.fortnox_inbox_scan_state SET state = _state, updated_at = now(),
 lease_token = CASE WHEN _release THEN NULL ELSE _token END,
 lease_until = CASE WHEN _release THEN NULL ELSE now() + interval '15 minutes' END
 WHERE legal_entity_code = _entity AND lease_token = _token AND lease_until > now();
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.checkpoint_fortnox_inbox_scan(text,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_fortnox_inbox_scan(text,uuid,jsonb,boolean) TO service_role;