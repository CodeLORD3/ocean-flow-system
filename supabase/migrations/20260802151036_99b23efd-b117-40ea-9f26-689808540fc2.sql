CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  created_by_staff_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read conversations" ON public.chat_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create conversations" ON public.chat_conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update conversations" ON public.chat_conversations FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.chat_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  portal_key TEXT NOT NULL,
  portal_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, portal_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants TO authenticated;
GRANT ALL ON public.chat_participants TO service_role;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read participants" ON public.chat_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add participants" ON public.chat_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can remove participants" ON public.chat_participants FOR DELETE TO authenticated USING (true);

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_portal_key TEXT NOT NULL,
  sender_portal_name TEXT,
  sender_staff_id UUID,
  sender_name TEXT,
  body TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read messages" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can send messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can delete messages" ON public.chat_messages FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_participants_portal ON public.chat_participants(portal_key);