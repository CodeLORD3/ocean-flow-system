ALTER TABLE public.checklist_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;