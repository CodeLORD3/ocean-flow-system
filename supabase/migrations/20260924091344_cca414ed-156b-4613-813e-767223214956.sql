ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS original_store_id uuid;

CREATE TABLE IF NOT EXISTS public.customer_order_transfers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  from_store_id uuid not null references public.stores(id),
  to_store_id uuid not null references public.stores(id),
  status text not null default 'vantar' check (status in ('vantar','godkand','avbojd','atertagen')),
  message text,
  decision_reason text,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_order_transfers_one_pending ON public.customer_order_transfers(order_id) WHERE status='vantar';
GRANT SELECT ON public.customer_order_transfers TO authenticated;
GRANT ALL ON public.customer_order_transfers TO service_role;
ALTER TABLE public.customer_order_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Personal ser flyttar för sina butiker" ON public.customer_order_transfers;
CREATE POLICY "Personal ser flyttar för sina butiker" ON public.customer_order_transfers FOR SELECT TO authenticated
USING (public.can_see_store(from_store_id) OR public.can_see_store(to_store_id));

CREATE OR REPLACE FUNCTION public._actor_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  select coalesce((select nullif(trim(coalesce(s.first_name,'')||' '||coalesce(s.last_name,'')),'') from public.current_staff() s), 'Okänd')
$$;

CREATE OR REPLACE FUNCTION public.request_customer_order_transfer(_order_id uuid, _to_store_id uuid, _message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; f record; t record; _id uuid; _name text := public._actor_name();
BEGIN
  SELECT * INTO o FROM customer_orders WHERE id=_order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Beställningen finns inte.'; END IF;
  IF NOT public.can_see_store(o.store_id) THEN RAISE EXCEPTION 'Du har inte behörighet till den här butiken.'; END IF;
  IF o.store_id = _to_store_id THEN RAISE EXCEPTION 'Välj en annan butik.'; END IF;
  IF o.pack_status = 'packad' OR o.status IN ('packad','levererad','avhamtad','avbruten','delvis_utlamnad') OR o.cancelled_at IS NOT NULL OR o.archived_at IS NOT NULL OR o.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Beställningen kan inte flyttas när den är packad, utlämnad, avbruten eller arkiverad.'; END IF;
  IF EXISTS (SELECT 1 FROM customer_order_lines WHERE customer_order_id=_order_id AND pack_status='packad') THEN
    RAISE EXCEPTION 'Beställningen har redan packade rader och kan inte flyttas.'; END IF;
  SELECT * INTO f FROM stores WHERE id=o.store_id;
  SELECT * INTO t FROM stores WHERE id=_to_store_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Butiken finns inte.'; END IF;
  IF coalesce(f.legal_entity_id,'') <> coalesce(t.legal_entity_id,'') THEN
    RAISE EXCEPTION 'Beställningar kan bara flyttas mellan butiker i samma bolag.'; END IF;
  IF EXISTS (SELECT 1 FROM customer_order_transfers WHERE order_id=_order_id AND status='vantar') THEN
    RAISE EXCEPTION 'Det finns redan en förfrågan som väntar på svar.'; END IF;
  INSERT INTO customer_order_transfers(order_id, from_store_id, to_store_id, message, requested_by, requested_by_name)
  VALUES (_order_id, o.store_id, _to_store_id, nullif(trim(_message),''), auth.uid(), _name) RETURNING id INTO _id;
  INSERT INTO customer_order_events(customer_order_id, event_type, description, new_value, performed_by)
  VALUES (_order_id, 'flytt_begard', 'Flytt till '||t.name||' begärd', jsonb_build_object('to_store_id',_to_store_id,'message',_message), _name);
  INSERT INTO notifications(portal, target_page, store_id, message, entity_type, entity_id, dedupe_key)
  VALUES ('shop','/customer-orders', _to_store_id, f.name||' vill flytta kundbeställning '||coalesce(o.order_number,'')||' till er. Godkänn eller avböj.', 'customer_order', _order_id::text, 'transfer-'||_id);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_customer_order_transfer(_transfer_id uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tr record; f record; t record; o record; _name text := public._actor_name();
BEGIN
  SELECT * INTO tr FROM customer_order_transfers WHERE id=_transfer_id FOR UPDATE;
  IF tr IS NULL OR tr.status <> 'vantar' THEN RAISE EXCEPTION 'Förfrågan är redan besvarad.'; END IF;
  IF NOT public.can_see_store(tr.to_store_id) THEN RAISE EXCEPTION 'Bara den mottagande butiken kan svara.'; END IF;
  SELECT * INTO f FROM stores WHERE id=tr.from_store_id;
  SELECT * INTO t FROM stores WHERE id=tr.to_store_id;
  SELECT * INTO o FROM customer_orders WHERE id=tr.order_id FOR UPDATE;
  UPDATE customer_order_transfers SET status=CASE WHEN _approve THEN 'godkand' ELSE 'avbojd' END,
    decision_reason=nullif(trim(_reason),''), decided_by=auth.uid(), decided_by_name=_name, decided_at=now() WHERE id=_transfer_id;
  IF _approve THEN
    IF o.store_id <> tr.from_store_id THEN RAISE EXCEPTION 'Beställningen har redan flyttats.'; END IF;
    UPDATE customer_orders SET store_id=tr.to_store_id, original_store_id=coalesce(original_store_id, tr.from_store_id), updated_at=now() WHERE id=tr.order_id;
    UPDATE customer_order_lines SET reserved_lot_id=null, reserved_quantity=null, reservation_status='inkopsbehov', updated_at=now()
      WHERE customer_order_id=tr.order_id AND coalesce(pack_status,'') <> 'packad';
    INSERT INTO customer_order_events(customer_order_id, event_type, description, old_value, new_value, performed_by)
    VALUES (tr.order_id, 'flytt_godkand', 'Flyttad från '||f.name||' till '||t.name, jsonb_build_object('store_id',tr.from_store_id), jsonb_build_object('store_id',tr.to_store_id), _name);
    INSERT INTO notifications(portal, target_page, store_id, message, entity_type, entity_id, dedupe_key)
    VALUES ('shop','/customer-orders', tr.from_store_id, t.name||' godkände flytten av '||coalesce(o.order_number,'')||'.', 'customer_order', tr.order_id::text, 'transfer-done-'||_transfer_id);
  ELSE
    INSERT INTO customer_order_events(customer_order_id, event_type, description, new_value, performed_by)
    VALUES (tr.order_id, 'flytt_avbojd', t.name||' avböjde flytten'||coalesce(': '||nullif(trim(_reason),''),''), jsonb_build_object('reason',_reason), _name);
    INSERT INTO notifications(portal, target_page, store_id, message, entity_type, entity_id, dedupe_key)
    VALUES ('shop','/customer-orders', tr.from_store_id, t.name||' avböjde flytten av '||coalesce(o.order_number,'')||coalesce(': '||nullif(trim(_reason),''),'.'), 'customer_order', tr.order_id::text, 'transfer-done-'||_transfer_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_customer_order_transfer(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tr record; _name text := public._actor_name();
BEGIN
  SELECT * INTO tr FROM customer_order_transfers WHERE id=_transfer_id FOR UPDATE;
  IF tr IS NULL OR tr.status <> 'vantar' THEN RAISE EXCEPTION 'Förfrågan är redan besvarad.'; END IF;
  IF NOT public.can_see_store(tr.from_store_id) THEN RAISE EXCEPTION 'Bara den skickande butiken kan ångra.'; END IF;
  UPDATE customer_order_transfers SET status='atertagen', decided_by=auth.uid(), decided_by_name=_name, decided_at=now() WHERE id=_transfer_id;
  INSERT INTO customer_order_events(customer_order_id, event_type, description, performed_by)
  VALUES (tr.order_id, 'flytt_atertagen', 'Flyttförfrågan återtagen', _name);
END $$;

CREATE OR REPLACE FUNCTION public.block_pack_on_pending_transfer() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.pack_status = 'packad' AND coalesce(OLD.pack_status,'') <> 'packad'
     AND EXISTS (SELECT 1 FROM customer_order_transfers WHERE order_id=NEW.customer_order_id AND status='vantar') THEN
    RAISE EXCEPTION 'Beställningen väntar på att flyttas till en annan butik och kan inte packas.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_pack_on_pending_transfer ON public.customer_order_lines;
CREATE TRIGGER trg_block_pack_on_pending_transfer BEFORE UPDATE ON public.customer_order_lines FOR EACH ROW EXECUTE FUNCTION public.block_pack_on_pending_transfer();

REVOKE EXECUTE ON FUNCTION public.request_customer_order_transfer(uuid,uuid,text), public.decide_customer_order_transfer(uuid,boolean,text), public.cancel_customer_order_transfer(uuid), public._actor_name() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_customer_order_transfer(uuid,uuid,text), public.decide_customer_order_transfer(uuid,boolean,text), public.cancel_customer_order_transfer(uuid) TO authenticated;