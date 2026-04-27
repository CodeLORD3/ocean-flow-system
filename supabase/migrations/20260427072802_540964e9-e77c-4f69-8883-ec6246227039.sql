-- Allow protocols without a store (wholesale / production)
ALTER TABLE public.meeting_protocols
  ALTER COLUMN store_id DROP NOT NULL;

-- Add portal classification
ALTER TABLE public.meeting_protocols
  ADD COLUMN IF NOT EXISTS portal text NOT NULL DEFAULT 'shop';

-- Backfill (column has default 'shop' so existing rows are already 'shop')
UPDATE public.meeting_protocols SET portal = 'shop' WHERE portal IS NULL;

-- Helpful index
CREATE INDEX IF NOT EXISTS meeting_protocols_portal_store_idx
  ON public.meeting_protocols (portal, store_id);