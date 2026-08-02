CREATE TABLE public.chat_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  portal_key TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_reads_conv_portal_idx ON public.chat_reads (conversation_id, portal_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reads TO authenticated;
GRANT ALL ON public.chat_reads TO service_role;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_reads_all_authenticated" ON public.chat_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);