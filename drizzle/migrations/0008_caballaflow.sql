CREATE OR REPLACE FUNCTION public.is_flow_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'owner')
$$;
REVOKE ALL ON FUNCTION public.is_flow_owner() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_flow_owner() TO authenticated;

CREATE TABLE public.flow_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  target text NOT NULL CHECK (target IN ('lovable','n8n','claude')),
  risk text NOT NULL DEFAULT 'normal' CHECK (risk IN ('normal','read_only')),
  why text,
  prompt text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'forslag' CHECK (status IN ('forslag','godkand','kors','klar','avvisad','fel')),
  approved_by uuid,
  approved_at timestamptz,
  result text,
  ran_at timestamptz,
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);
CREATE TABLE public.flow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  owner text NOT NULL CHECK (owner IN ('tim','baldvin','joakim')),
  phase text NOT NULL DEFAULT 'idag' CHECK (phase IN ('kopplingar','idag','vecka','senare')),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'att_gora' CHECK (status IN ('att_gora','pagar','klar')),
  why text, steps text, prompt text,
  done_at timestamptz, done_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.flow_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author uuid NOT NULL DEFAULT auth.uid(),
  author_name text,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.flow_agent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL
);

GRANT SELECT, INSERT, UPDATE ON public.flow_prompts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_tasks TO authenticated;
GRANT SELECT, INSERT ON public.flow_messages TO authenticated;
GRANT SELECT ON public.flow_agent_log TO authenticated;
GRANT ALL ON public.flow_prompts, public.flow_tasks, public.flow_messages, public.flow_agent_log TO service_role;

ALTER TABLE public.flow_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_agent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read prompts" ON public.flow_prompts FOR SELECT TO authenticated USING (public.is_flow_owner());
CREATE POLICY "owners insert prompts" ON public.flow_prompts FOR INSERT TO authenticated WITH CHECK (public.is_flow_owner() AND created_by = auth.uid() AND status = 'forslag' AND approved_by IS NULL);
CREATE POLICY "owners decide prompts" ON public.flow_prompts FOR UPDATE TO authenticated USING (public.is_flow_owner() AND created_by <> auth.uid()) WITH CHECK (public.is_flow_owner() AND approved_by = auth.uid());
CREATE POLICY "owners all tasks" ON public.flow_tasks FOR ALL TO authenticated USING (public.is_flow_owner()) WITH CHECK (public.is_flow_owner());
CREATE POLICY "owners read messages" ON public.flow_messages FOR SELECT TO authenticated USING (public.is_flow_owner());
CREATE POLICY "owners write messages" ON public.flow_messages FOR INSERT TO authenticated WITH CHECK (public.is_flow_owner() AND author = auth.uid());
CREATE POLICY "owners read log" ON public.flow_agent_log FOR SELECT TO authenticated USING (public.is_flow_owner());

CREATE OR REPLACE FUNCTION public.flow_prompts_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Promptar kan inte raderas'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.prompt IS DISTINCT FROM OLD.prompt
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Promptens innehåll kan inte ändras';
  END IF;
  IF auth.role() = 'service_role' OR current_user IN ('postgres','service_role') THEN
    RETURN NEW;
  END IF;
  -- vanliga användare: bara forslag -> godkand/avvisad
  IF OLD.status <> 'forslag' OR NEW.status NOT IN ('godkand','avvisad') THEN
    RAISE EXCEPTION 'Bara förslag kan godkännas eller avvisas';
  END IF;
  IF auth.uid() = OLD.created_by THEN RAISE EXCEPTION 'Du kan inte godkänna din egen prompt'; END IF;
  IF NEW.result IS DISTINCT FROM OLD.result OR NEW.ran_at IS DISTINCT FROM OLD.ran_at THEN
    RAISE EXCEPTION 'Resultat sätts bara av körningen';
  END IF;
  NEW.approved_by := auth.uid();
  NEW.approved_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER flow_prompts_guard BEFORE UPDATE OR DELETE ON public.flow_prompts FOR EACH ROW EXECUTE FUNCTION public.flow_prompts_guard();

CREATE OR REPLACE FUNCTION public.flow_tasks_done() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status = 'klar' AND (TG_OP = 'INSERT' OR OLD.status <> 'klar') THEN
    NEW.done_at := now(); NEW.done_by := auth.uid();
  ELSIF NEW.status <> 'klar' THEN
    NEW.done_at := NULL; NEW.done_by := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flow_tasks_done BEFORE INSERT OR UPDATE ON public.flow_tasks FOR EACH ROW EXECUTE FUNCTION public.flow_tasks_done();

CREATE OR REPLACE FUNCTION public.flow_claim_prompt() RETURNS SETOF public.flow_prompts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.flow_prompts WHERE status='godkand' ORDER BY approved_at NULLS LAST, created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF _id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.flow_prompts SET status='kors' WHERE id=_id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.flow_claim_prompt() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flow_claim_prompt() TO service_role;

CREATE INDEX flow_prompts_status_idx ON public.flow_prompts(status, approved_at);
CREATE INDEX flow_messages_created_idx ON public.flow_messages(created_at DESC);
CREATE INDEX flow_agent_log_created_idx ON public.flow_agent_log(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_messages;