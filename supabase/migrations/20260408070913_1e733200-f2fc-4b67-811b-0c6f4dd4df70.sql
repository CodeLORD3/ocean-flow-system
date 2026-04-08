ALTER TABLE public.schedule_events
ADD COLUMN recurrence_type text NOT NULL DEFAULT 'none',
ADD COLUMN recurrence_end_date date;