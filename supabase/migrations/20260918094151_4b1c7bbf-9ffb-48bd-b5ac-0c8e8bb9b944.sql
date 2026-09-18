-- Räkning per lagerplats, person och aktivitet
ALTER TABLE public.stock_count_sessions
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

ALTER TABLE public.stock_count_sessions
  DROP CONSTRAINT IF EXISTS stock_count_sessions_status_check;
ALTER TABLE public.stock_count_sessions
  ADD CONSTRAINT stock_count_sessions_status_check
  CHECK (status = ANY (ARRAY['open'::text, 'inskickad'::text, 'locked'::text]));

DROP INDEX IF EXISTS public.stock_count_sessions_one_open_per_day;
CREATE UNIQUE INDEX IF NOT EXISTS stock_count_sessions_one_open_per_place
  ON public.stock_count_sessions (store_id, count_date, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

-- Parti per räknad rad
ALTER TABLE public.stock_count_lines
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL;

ALTER TABLE public.stock_count_lines
  DROP CONSTRAINT IF EXISTS stock_count_lines_session_id_product_id_location_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS stock_count_lines_unique_row
  ON public.stock_count_lines (
    session_id,
    product_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Underlag som väntar på godkännande
ALTER TABLE public.inventory_reports
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS count_session_id uuid REFERENCES public.stock_count_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_reports_status
  ON public.inventory_reports (store_id, status, reported_at DESC);