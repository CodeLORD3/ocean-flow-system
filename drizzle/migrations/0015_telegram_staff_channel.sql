CREATE OR REPLACE FUNCTION public.is_telegram_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'kommunikation'::app_role) OR is_platform_admin(auth.uid())
$$;

CREATE TABLE public.telegram_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bot_username text NOT NULL DEFAULT 'MakrillPersonalBot',
  staff_group_chat_id bigint,
  sick_reply text NOT NULL DEFAULT 'Krya på dig! Sjukanmäl dig i Makrill-appen (Profil → Frånvaro → Sjuk) eller ring din butikschef före passets start.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_settings (id) VALUES (true);
GRANT SELECT, UPDATE ON public.telegram_settings TO authenticated;
GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg settings read" ON public.telegram_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "tg settings admin" ON public.telegram_settings FOR UPDATE TO authenticated USING (is_telegram_admin()) WITH CHECK (is_telegram_admin());

CREATE TABLE public.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL UNIQUE,
  username text, first_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  consent_at timestamptz
);
CREATE INDEX ON public.telegram_users(employee_id);
GRANT SELECT ON public.telegram_users TO authenticated;
GRANT ALL ON public.telegram_users TO service_role;
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg users read" ON public.telegram_users FOR SELECT TO authenticated
  USING (is_telegram_admin() OR employee_is_self(employee_id));

CREATE TABLE public.telegram_link_codes (
  code text PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_at timestamptz,
  created_by uuid
);
GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_business_connections (
  business_connection_id text PRIMARY KEY,
  telegram_user_id bigint,
  user_chat_id bigint,
  can_reply boolean,
  is_enabled boolean NOT NULL DEFAULT true,
  label text DEFAULT 'Fiskskaldjur Kontoret',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_business_connections TO authenticated;
GRANT ALL ON public.telegram_business_connections TO service_role;
ALTER TABLE public.telegram_business_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg bc read" ON public.telegram_business_connections FOR SELECT TO authenticated USING (is_telegram_admin());

CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id bigint UNIQUE,
  chat_id bigint NOT NULL,
  chat_type text CHECK (chat_type IN ('private','group','supergroup','channel')),
  thread_id bigint,
  telegram_user_id bigint,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  business_connection_id text,
  direction text NOT NULL CHECK (direction IN ('in','ut')),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice','photo','document')),
  body text,
  file_id text,
  status text NOT NULL DEFAULT 'mottagen' CHECK (status IN ('mottagen','skickad','fel')),
  error text,
  sent_by uuid,
  ai_generated boolean NOT NULL DEFAULT false,
  category text CHECK (category IN ('schema_pass','fraga','lager_rapport','ide_klagomal','ovrigt')),
  conversation_status text NOT NULL DEFAULT 'ny' CHECK (conversation_status IN ('ny','pågår','väntar på svar','klar')),
  assigned_to uuid,
  conv_key text GENERATED ALWAYS AS (
    CASE WHEN chat_type IN ('group','supergroup') THEN 'g:' || chat_id || ':' || coalesce(thread_id, 0)
         ELSE 'p:' || chat_id END) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.telegram_messages(conv_key, created_at DESC);
CREATE INDEX ON public.telegram_messages(created_at);
CREATE INDEX ON public.telegram_messages(assigned_to);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg msg read" ON public.telegram_messages FOR SELECT TO authenticated
  USING (is_telegram_admin() OR assigned_to = auth.uid());

CREATE OR REPLACE FUNCTION public.telegram_messages_inherit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  SELECT category, assigned_to, conversation_status INTO p FROM telegram_messages
   WHERE conv_key = (CASE WHEN NEW.chat_type IN ('group','supergroup') THEN 'g:' || NEW.chat_id || ':' || coalesce(NEW.thread_id,0) ELSE 'p:' || NEW.chat_id END)
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    NEW.category := coalesce(NEW.category, p.category);
    NEW.assigned_to := coalesce(NEW.assigned_to, p.assigned_to);
    IF NEW.direction = 'in' THEN
      NEW.conversation_status := CASE WHEN p.conversation_status = 'klar' THEN 'ny' ELSE 'pågår' END;
    ELSE
      NEW.conversation_status := p.conversation_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_telegram_inherit BEFORE INSERT ON public.telegram_messages FOR EACH ROW EXECUTE FUNCTION public.telegram_messages_inherit();

CREATE OR REPLACE FUNCTION public.telegram_create_link_code(_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _code text; _bot text;
BEGIN
  IF NOT (employee_is_self(_employee_id) OR is_telegram_admin() OR (has_role(auth.uid(),'store_manager'::app_role) AND can_see_employee(_employee_id))) THEN
    RAISE EXCEPTION 'Saknar behörighet';
  END IF;
  _code := encode(gen_random_bytes(9), 'hex');
  INSERT INTO telegram_link_codes(code, employee_id, created_by) VALUES (_code, _employee_id, auth.uid());
  SELECT bot_username INTO _bot FROM telegram_settings LIMIT 1;
  RETURN jsonb_build_object('code', _code, 'url', 'https://t.me/' || _bot || '?start=' || _code, 'expires_at', now() + interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION public.telegram_create_link_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_create_link_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.telegram_set_conversation(_conv_key text, _status text DEFAULT NULL, _category text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_telegram_admin() OR EXISTS (SELECT 1 FROM telegram_messages WHERE conv_key = _conv_key AND assigned_to = auth.uid())) THEN
    RAISE EXCEPTION 'Saknar behörighet';
  END IF;
  UPDATE telegram_messages SET conversation_status = coalesce(_status, conversation_status), category = coalesce(_category, category)
   WHERE conv_key = _conv_key;
END $$;
REVOKE ALL ON FUNCTION public.telegram_set_conversation(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_set_conversation(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.telegram_assignees()
RETURNS TABLE(user_id uuid, full_name text, label text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.first_name || ' ' || s.last_name,
    CASE WHEN s.first_name = 'Baldvin' AND s.last_name = 'Ahlander' THEN 'Sverige'
         WHEN s.first_name = 'Joakim' AND s.last_name = 'Hvarfvenius' THEN 'Schweiz'
         ELSE coalesce((SELECT name FROM stores WHERE id = s.store_id), 'Butikschef') END
  FROM staff s
  WHERE s.user_id IS NOT NULL AND is_staff() AND (
    (s.first_name = 'Baldvin' AND s.last_name = 'Ahlander') OR (s.first_name = 'Joakim' AND s.last_name = 'Hvarfvenius')
    OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = s.user_id AND r.role IN ('store_manager','multi_store_manager')))
  ORDER BY 3, 2
$$;
REVOKE ALL ON FUNCTION public.telegram_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_assignees() TO authenticated;

CREATE OR REPLACE FUNCTION public.telegram_assign(_conv_key text, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _who text;
BEGIN
  IF NOT is_telegram_admin() THEN RAISE EXCEPTION 'Saknar behörighet'; END IF;
  UPDATE telegram_messages SET assigned_to = _user_id WHERE conv_key = _conv_key;
  IF _user_id IS NOT NULL THEN
    SELECT coalesce(e.first_name || ' ' || e.last_name, 'personalgruppen') INTO _who
      FROM telegram_messages m LEFT JOIN employees e ON e.id = m.employee_id
     WHERE m.conv_key = _conv_key ORDER BY m.created_at DESC LIMIT 1;
    INSERT INTO notifications(portal, target_page, user_id, message, entity_type, entity_id, dedupe_key)
    VALUES ('erp', '/meddelanden', _user_id, 'Telegram-konversation tilldelad dig: ' || coalesce(_who, 'okänd avsändare'),
            'telegram_conversation', _conv_key, 'tg-assign:' || _conv_key || ':' || _user_id || ':' || extract(epoch from now())::bigint);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.telegram_assign(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_assign(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.telegram_purge_old()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM telegram_messages WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM telegram_link_codes WHERE expires_at < now() - interval '7 days';
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.telegram_purge_old() FROM PUBLIC, anon, authenticated;

-- Godkänt Telegram-utkast skickas direkt: triggern väcker telegram-send med bara utkastets id.
CREATE OR REPLACE FUNCTION public.ai_utkast_telegram_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.kanal = 'telegram' AND NEW.status = 'godkänt' AND (OLD.status IS DISTINCT FROM 'godkänt') THEN
    PERFORM net.http_post(
      url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/telegram-send',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
      body := jsonb_build_object('draft_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ai_utkast_telegram AFTER UPDATE OF status ON public.ai_utkast FOR EACH ROW EXECUTE FUNCTION public.ai_utkast_telegram_dispatch();

DO $$ BEGIN
  PERFORM cron.schedule('telegram-gallring', '50 2 * * *', 'SELECT public.telegram_purge_old();');
END $$;