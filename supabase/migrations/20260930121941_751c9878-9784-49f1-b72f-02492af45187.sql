ALTER TABLE public.work_sites ADD COLUMN IF NOT EXISTS mobile_self_punch boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.nightly_logout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  sessions_ended integer NOT NULL DEFAULT 0,
  oauth_sessions_kept integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nightly_logout_runs TO authenticated;
GRANT ALL ON public.nightly_logout_runs TO service_role;
ALTER TABLE public.nightly_logout_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin läser nattlig utloggning" ON public.nightly_logout_runs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Globalt "sessioner giltiga från": appen loggar ut sessioner som startat före denna tid.
CREATE OR REPLACE FUNCTION public.sessions_valid_from()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(ran_at) FROM public.nightly_logout_runs WHERE status = 'ok'
$$;
REVOKE ALL ON FUNCTION public.sessions_valid_from() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sessions_valid_from() TO authenticated;

-- Avslutar alla vanliga inloggningar (inte MCP/OAuth-klienter). Endast service role.
CREATE OR REPLACE FUNCTION public.nightly_logout_run()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _ended integer := 0; _kept integer := 0; _msg text; _status text := 'ok';
BEGIN
  BEGIN
    SELECT count(*) INTO _kept FROM auth.sessions WHERE oauth_client_id IS NOT NULL;
    WITH d AS (DELETE FROM auth.sessions WHERE oauth_client_id IS NULL RETURNING 1)
    SELECT count(*) INTO _ended FROM d;
  EXCEPTION WHEN OTHERS THEN
    _msg := 'Serverns sessioner kunde inte avslutas (' || SQLERRM || '); appen loggar ut via tidsgräns.';
  END;
  INSERT INTO public.nightly_logout_runs (sessions_ended, oauth_sessions_kept, status, message)
  VALUES (_ended, _kept, _status, _msg);
  RETURN jsonb_build_object('sessions_ended', _ended, 'oauth_sessions_kept', _kept, 'message', _msg);
END $$;
REVOKE ALL ON FUNCTION public.nightly_logout_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nightly_logout_run() TO service_role;