-- Sublager: ärver nivå från föräldern, max ett steg djupt
CREATE OR REPLACE FUNCTION public.enforce_location_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p_type public.location_type;
  p_parent uuid;
BEGIN
  IF NEW.parent_location_id IS NOT NULL THEN
    IF NEW.parent_location_id = NEW.id THEN
      RAISE EXCEPTION 'En lagerplats kan inte vara sin egen förälder.';
    END IF;
    SELECT location_type, parent_location_id INTO p_type, p_parent
      FROM public.storage_locations WHERE id = NEW.parent_location_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Föräldralagerplatsen hittades inte.';
    END IF;
    IF p_parent IS NOT NULL THEN
      RAISE EXCEPTION 'Ett sublager kan bara ligga direkt under en huvudnivå.';
    END IF;
    -- Sublagret ärver alltid förälderns nivå
    NEW.location_type := p_type;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_location_hierarchy
  BEFORE INSERT OR UPDATE ON public.storage_locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_location_hierarchy();

-- Flödesregler på typ, plus fri omflyttning mellan sublager under samma förälder
CREATE OR REPLACE FUNCTION public.enforce_transfer_flow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  f public.location_type;
  t public.location_type;
  f_root uuid;
  t_root uuid;
  rule public.stock_flow_rules;
  from_active boolean;
  to_active boolean;
  open_dev int;
  internal_move boolean := false;
BEGIN
  SELECT location_type, active, COALESCE(parent_location_id, id)
    INTO f, from_active, f_root FROM public.storage_locations WHERE id = NEW.from_location_id;
  SELECT location_type, active, COALESCE(parent_location_id, id)
    INTO t, to_active, t_root FROM public.storage_locations WHERE id = NEW.to_location_id;

  IF NOT COALESCE(from_active, false) OR NOT COALESCE(to_active, false) THEN
    RAISE EXCEPTION 'Lagerplatsen är inaktiverad och kan inte användas i en överföring.';
  END IF;
  IF f IS NULL OR t IS NULL THEN
    RAISE EXCEPTION 'Lagerplatsen saknar nivå (location_type) och kan inte användas i en överföring.';
  END IF;

  -- Omflyttning inom samma lager (två sublager under samma förälder) kräver inget underlag
  internal_move := f_root = t_root;

  IF NOT internal_move THEN
    SELECT * INTO rule FROM public.stock_flow_rules WHERE from_type = f AND to_type = t AND allowed;
    IF NOT FOUND THEN
      IF f = 'tillverkningslager' THEN
        RAISE EXCEPTION 'Tillverkningslagret kan bara skicka till grossistlagret';
      END IF;
      RAISE EXCEPTION 'Flytt från % till % är inte tillåten.', f, t;
    END IF;

    IF rule.requires_reason AND COALESCE(NEW.reason, '') = '' THEN
      RAISE EXCEPTION 'Flytten kräver orsak.';
    END IF;

    IF NEW.status IN ('godkand_utleverans','under_transport','delvis_levererad','godkand_inleverans') THEN
      IF COALESCE(NEW.source_document_type, '') = '' OR COALESCE(NEW.source_document_id, '') = '' THEN
        RAISE EXCEPTION 'Leveransen saknar underlag. Välj beställning eller skapa flyttorder.';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'plocklista_utskriven' AND NEW.picklist_printed_at IS NULL THEN
    NEW.picklist_printed_at := now();
  END IF;

  IF NEW.status = 'godkand_inleverans' THEN
    SELECT count(*) INTO open_dev
    FROM public.transfer_order_lines l
    WHERE l.transfer_order_id = NEW.id
      AND l.quantity_received IS DISTINCT FROM l.quantity_shipped
      AND COALESCE(l.receive_deviation_reason, '') = '';
    IF open_dev > 0 THEN
      RAISE EXCEPTION 'Leveransen har % rad(er) med oredovisad avvikelse.', open_dev;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- Saldo per plats inklusive sublager (summeringar rullar uppåt)
CREATE OR REPLACE VIEW public.location_stock_rollup
WITH (security_invoker = true) AS
SELECT l.id AS location_id,
       l.name,
       l.store_id,
       l.location_type,
       l.parent_location_id,
       l.active,
       COALESCE(SUM(p.quantity), 0)::numeric(14,3) AS quantity,
       COALESCE(SUM(p.stock_value), 0)::numeric(14,2) AS stock_value,
       COUNT(DISTINCT p.product_id) AS product_count
FROM public.storage_locations l
LEFT JOIN public.storage_locations c
       ON c.id = l.id OR c.parent_location_id = l.id
LEFT JOIN public.product_stock_locations p ON p.location_id = c.id
GROUP BY l.id, l.name, l.store_id, l.location_type, l.parent_location_id, l.active;

GRANT SELECT ON public.location_stock_rollup TO authenticated;
GRANT SELECT ON public.location_stock_rollup TO service_role;