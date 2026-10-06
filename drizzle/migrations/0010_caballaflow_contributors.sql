CREATE OR REPLACE FUNCTION public.is_flow_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('owner','contributor'))
$$;
REVOKE ALL ON FUNCTION public.is_flow_member() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_flow_member() TO authenticated;

ALTER TABLE public.flow_tasks ADD COLUMN IF NOT EXISTS owner_user_id uuid;
UPDATE public.flow_tasks t SET owner_user_id = s.user_id
FROM public.staff s
WHERE t.owner_user_id IS NULL AND s.user_id IS NOT NULL
  AND ((t.owner='tim' AND s.first_name='Tim' AND s.last_name='Hvarfvenius')
    OR (t.owner='baldvin' AND s.first_name='Baldvin' AND s.last_name='Ahlander')
    OR (t.owner='joakim' AND s.first_name='Joakim' AND s.last_name='Hvarfvenius'));
ALTER TABLE public.flow_tasks DROP CONSTRAINT IF EXISTS flow_tasks_owner_check;
ALTER TABLE public.flow_tasks ALTER COLUMN owner SET DEFAULT '';
COMMENT ON COLUMN public.flow_tasks.owner IS 'DEPRECATED: replaced by owner_user_id';
CREATE INDEX IF NOT EXISTS flow_tasks_owner_user_idx ON public.flow_tasks(owner_user_id);

DROP POLICY IF EXISTS "owners read prompts" ON public.flow_prompts;
DROP POLICY IF EXISTS "owners insert prompts" ON public.flow_prompts;
CREATE POLICY "members read prompts" ON public.flow_prompts FOR SELECT TO authenticated USING (public.is_flow_member());
CREATE POLICY "members insert prompts" ON public.flow_prompts FOR INSERT TO authenticated WITH CHECK (public.is_flow_member() AND created_by = auth.uid() AND status = 'forslag' AND approved_by IS NULL);

DROP POLICY IF EXISTS "owners all tasks" ON public.flow_tasks;
CREATE POLICY "members read tasks" ON public.flow_tasks FOR SELECT TO authenticated USING (public.is_flow_member());
CREATE POLICY "members insert tasks" ON public.flow_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_flow_owner() OR (public.is_flow_member() AND owner_user_id = auth.uid()));
CREATE POLICY "members update tasks" ON public.flow_tasks FOR UPDATE TO authenticated
  USING (public.is_flow_owner() OR (public.is_flow_member() AND owner_user_id = auth.uid()))
  WITH CHECK (public.is_flow_owner() OR (public.is_flow_member() AND owner_user_id = auth.uid()));
CREATE POLICY "members delete tasks" ON public.flow_tasks FOR DELETE TO authenticated
  USING (public.is_flow_owner() OR (public.is_flow_member() AND owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "owners read messages" ON public.flow_messages;
DROP POLICY IF EXISTS "owners write messages" ON public.flow_messages;
CREATE POLICY "members read messages" ON public.flow_messages FOR SELECT TO authenticated USING (public.is_flow_member());
CREATE POLICY "members write messages" ON public.flow_messages FOR INSERT TO authenticated WITH CHECK (public.is_flow_member() AND author = auth.uid());

DROP POLICY IF EXISTS "owners read log" ON public.flow_agent_log;
CREATE POLICY "members read log" ON public.flow_agent_log FOR SELECT TO authenticated USING (public.is_flow_member());

CREATE OR REPLACE FUNCTION public.flow_members() RETURNS TABLE(user_id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.user_id,
         COALESCE(NULLIF(trim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')), ''), 'Okänd'),
         CASE WHEN bool_or(r.role::text='owner') THEN 'owner' ELSE 'contributor' END
  FROM public.user_roles r
  LEFT JOIN LATERAL (SELECT first_name, last_name FROM public.staff WHERE staff.user_id = r.user_id LIMIT 1) s ON true
  WHERE r.role::text IN ('owner','contributor') AND public.is_flow_member()
  GROUP BY r.user_id, s.first_name, s.last_name
  ORDER BY 3 DESC, 2
$$;

CREATE OR REPLACE FUNCTION public.flow_staff_candidates(_search text) RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.user_id, trim(s.first_name || ' ' || s.last_name)
  FROM public.staff s
  WHERE public.is_flow_owner() AND s.user_id IS NOT NULL
    AND (coalesce(_search,'') = '' OR (s.first_name || ' ' || s.last_name) ILIKE '%' || _search || '%')
  ORDER BY s.first_name, s.last_name
  LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.flow_set_contributor(_user_id uuid, _on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_flow_owner() THEN RAISE EXCEPTION 'Bara ägare kan ändra medlemmar'; END IF;
  IF _on THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'contributor') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role::text = 'contributor';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.flow_members() FROM public, anon;
REVOKE ALL ON FUNCTION public.flow_staff_candidates(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.flow_set_contributor(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.flow_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_staff_candidates(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flow_set_contributor(uuid, boolean) TO authenticated;