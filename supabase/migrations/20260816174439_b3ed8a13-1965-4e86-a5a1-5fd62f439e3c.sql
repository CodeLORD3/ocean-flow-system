ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS idx_price_lists_entity ON public.price_lists(legal_entity_id) WHERE pos_enabled;

DROP TRIGGER IF EXISTS trg_price_lists_updated_at ON public.price_lists;
CREATE TRIGGER trg_price_lists_updated_at BEFORE UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.pos_enqueue_price_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.price_list_items;
  _list public.price_lists;
BEGIN
  _row := COALESCE(NEW, OLD);
  SELECT * INTO _list FROM public.price_lists WHERE id = _row.price_list_id;
  IF _list.id IS NULL OR _list.pos_enabled IS NOT TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.pos_sync_queue (entity_type, entity_id, payload, status)
  VALUES (
    'price_item',
    _row.id::text,
    jsonb_build_object(
      'action', CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
      'price_list_id', _list.id,
      'price_list_name', _list.name,
      'legal_entity_id', _list.legal_entity_id,
      'store_id', _list.store_id,
      'valid_from', _list.valid_from,
      'sku', _row.sku,
      'barcode', _row.barcode,
      'name', _row.product_name,
      'unit', _row.unit,
      'price', _row.price,
      'vat_rate', _row.vat_rate,
      'pos_enabled', _row.pos_enabled
    ),
    'pending'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_enqueue_price_item ON public.price_list_items;
CREATE TRIGGER trg_pos_enqueue_price_item
  AFTER INSERT OR UPDATE OR DELETE ON public.price_list_items
  FOR EACH ROW EXECUTE FUNCTION public.pos_enqueue_price_item();

CREATE OR REPLACE FUNCTION public.pos_enqueue_price_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pos_enabled IS TRUE AND COALESCE(OLD.pos_enabled, false) IS FALSE THEN
    INSERT INTO public.pos_sync_queue (entity_type, entity_id, payload, status)
    SELECT 'price_item', i.id::text,
      jsonb_build_object(
        'action', 'upsert',
        'price_list_id', NEW.id,
        'price_list_name', NEW.name,
        'legal_entity_id', NEW.legal_entity_id,
        'store_id', NEW.store_id,
        'valid_from', NEW.valid_from,
        'sku', i.sku,
        'barcode', i.barcode,
        'name', i.product_name,
        'unit', i.unit,
        'price', i.price,
        'vat_rate', i.vat_rate,
        'pos_enabled', i.pos_enabled
      ), 'pending'
    FROM public.price_list_items i
    WHERE i.price_list_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_enqueue_price_list ON public.price_lists;
CREATE TRIGGER trg_pos_enqueue_price_list
  AFTER UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.pos_enqueue_price_list();

CREATE OR REPLACE VIEW public.pos_price_overview AS
SELECT
  pl.id AS price_list_id,
  pl.name AS price_list_name,
  pl.legal_entity_id,
  le.legal_name,
  pl.store_id,
  s.name AS store_name,
  pl.pos_enabled,
  pl.valid_from,
  i.id AS item_id,
  i.sku,
  i.barcode,
  i.product_name,
  i.unit,
  i.price,
  i.vat_rate,
  i.pos_enabled AS item_pos_enabled,
  i.category
FROM public.price_lists pl
JOIN public.price_list_items i ON i.price_list_id = pl.id
LEFT JOIN public.legal_entities le ON le.legal_entity_id = pl.legal_entity_id
LEFT JOIN public.stores s ON s.id = pl.store_id;

GRANT SELECT ON public.pos_price_overview TO authenticated;
GRANT ALL ON public.pos_price_overview TO service_role;

CREATE OR REPLACE FUNCTION public.pos_queue_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'sent_today', count(*) FILTER (WHERE status = 'sent' AND sent_at >= (now() AT TIME ZONE 'Europe/Stockholm')::date),
    'oldest_pending', min(created_at) FILTER (WHERE status = 'pending')
  )
  FROM public.pos_sync_queue;
$$;