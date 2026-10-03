ALTER TABLE public.customers_retail ADD COLUMN IF NOT EXISTS internal_store_id uuid REFERENCES public.stores(id);
COMMENT ON COLUMN public.customers_retail.internal_store_id IS 'Kunden är en egen butik; beställningar skickas som lageröverföring i stället för försäljning.';
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS internal_transfer_id uuid;

CREATE OR REPLACE FUNCTION public.send_customer_order_to_store(_order_id uuid, _to_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.customer_orders;
  from_loc uuid; transport_loc uuid; to_loc uuid;
  t_id uuid; staff_id uuid; n int := 0; l record; mv record;
  onum text;
BEGIN
  SELECT * INTO o FROM customer_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Beställningen hittades inte.'; END IF;
  IF NOT can_see_store(o.store_id) THEN RAISE EXCEPTION 'Du har inte behörighet för butiken.'; END IF;
  IF o.internal_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Beställningen är redan skickad.'; END IF;
  IF o.status <> 'packad' THEN RAISE EXCEPTION 'Beställningen måste vara packad innan den skickas.'; END IF;
  IF _to_store_id = o.store_id THEN RAISE EXCEPTION 'Välj en annan butik.'; END IF;
  IF company_of_store(o.store_id, current_date) IS DISTINCT FROM company_of_store(_to_store_id, current_date) THEN
    RAISE EXCEPTION 'Butikerna tillhör olika bolag. Flytt mellan bolag är inte tillåten här.';
  END IF;

  SELECT id INTO transport_loc FROM storage_locations WHERE store_id=o.store_id AND location_type='leveranslager' AND active ORDER BY created_at LIMIT 1;
  SELECT id INTO to_loc FROM storage_locations WHERE store_id=_to_store_id AND location_type='butik' AND active AND parent_location_id IS NULL ORDER BY created_at LIMIT 1;
  IF transport_loc IS NULL THEN RAISE EXCEPTION 'Avsändande butik saknar aktivt transportlager.'; END IF;
  IF to_loc IS NULL THEN RAISE EXCEPTION 'Mottagande butik saknar aktivt försäljningslager.'; END IF;

  SELECT id INTO staff_id FROM staff WHERE user_id = auth.uid() LIMIT 1;
  onum := 'FS-' || to_char(now() AT TIME ZONE 'Europe/Stockholm','YYYYMMDD') || '-' || (floor(random()*9000)+1000)::int;

  INSERT INTO transfer_orders(order_number, from_location_id, to_location_id, source_document_type, source_document_id, reason, status, created_by)
  VALUES (onum, transport_loc, to_loc, 'customer_order', o.id::text, 'Kundbeställning ' || o.order_number, 'skapad', staff_id)
  RETURNING id INTO t_id;

  FOR l IN SELECT * FROM customer_order_lines WHERE customer_order_id=o.id AND pack_status='packad'
           AND product_id IS NOT NULL AND coalesce(is_free_text,false)=false AND coalesce(quantity_packed,0) > 0 AND movement_id IS NOT NULL ORDER BY sort_order LOOP
    SELECT * INTO mv FROM stock_movements WHERE id = l.movement_id;
    IF mv.id IS NULL THEN CONTINUE; END IF;
    from_loc := mv.location_id;
    -- Uttaget som kundorder återförs och flyttas i stället till transportlagret.
    INSERT INTO stock_movements(product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, reference_id, note, created_by)
    VALUES (l.product_id, from_loc, mv.lot_id, 'kundorder_reversering', abs(mv.quantity_kg), mv.unit_cost, 'customer_order_line', l.id, 'Skickas som överföring ' || onum, staff_id),
           (l.product_id, from_loc, mv.lot_id, 'overforing_ut', -abs(mv.quantity_kg), mv.unit_cost, 'transfer_order', t_id, 'Till transportlager ' || onum, staff_id),
           (l.product_id, transport_loc, mv.lot_id, 'overforing_in', abs(mv.quantity_kg), mv.unit_cost, 'transfer_order', t_id, 'Packad kundbeställning ' || o.order_number, staff_id);
    INSERT INTO transfer_order_lines(transfer_order_id, product_id, lot_id, quantity_ordered, quantity_picked, quantity_shipped, unit_cost, sort_order)
    VALUES (t_id, l.product_id, mv.lot_id, abs(mv.quantity_kg), abs(mv.quantity_kg), abs(mv.quantity_kg), mv.unit_cost, n);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Beställningen har inga packade varor att skicka.'; END IF;

  UPDATE transfer_orders SET status='under_transport', picked_by=staff_id, picked_at=now(), approved_out_by=staff_id, approved_out_at=now() WHERE id=t_id;
  UPDATE customer_orders SET internal_transfer_id=t_id WHERE id=o.id;
  INSERT INTO customer_order_events(customer_order_id, event_type, description, performed_by)
  VALUES (o.id, 'skickad_till_butik', 'Skickad som lageröverföring ' || onum || ' (' || n || ' rader)', staff_id);
  RETURN jsonb_build_object('transfer_id', t_id, 'order_number', onum, 'lines', n);
END $$;
REVOKE ALL ON FUNCTION public.send_customer_order_to_store(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.send_customer_order_to_store(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_customer_order_on_inbound()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source_document_type = 'customer_order' AND NEW.status = 'godkand_inleverans'
     AND OLD.status IS DISTINCT FROM 'godkand_inleverans' THEN
    UPDATE customer_orders SET status='levererad', handed_over_at=coalesce(handed_over_at, now())
      WHERE id::text = NEW.source_document_id AND status NOT IN ('levererad','avhamtad','avbruten');
    INSERT INTO customer_order_events(customer_order_id, event_type, description)
      SELECT id, 'levererad', 'Mottagen i butiken via ' || NEW.order_number FROM customer_orders WHERE id::text = NEW.source_document_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.finish_customer_order_on_inbound() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_finish_customer_order_on_inbound ON public.transfer_orders;
CREATE TRIGGER trg_finish_customer_order_on_inbound AFTER UPDATE OF status ON public.transfer_orders
FOR EACH ROW EXECUTE FUNCTION public.finish_customer_order_on_inbound();