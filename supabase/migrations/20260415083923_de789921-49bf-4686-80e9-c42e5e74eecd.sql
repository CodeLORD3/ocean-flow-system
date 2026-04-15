-- Add task fields to schedule_events
ALTER TABLE public.schedule_events
  ADD COLUMN assigned_to uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN is_done boolean NOT NULL DEFAULT false,
  ADD COLUMN meeting_item_id uuid REFERENCES public.meeting_protocol_items(id) ON DELETE SET NULL;

-- Add deadline to meeting_protocol_items
ALTER TABLE public.meeting_protocol_items
  ADD COLUMN deadline date;