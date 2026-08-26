ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type = ANY (ARRAY['inleverans','tillverkning_in','tillverkning_ut','overforing_in','overforing_ut','forsaljning','kundorder','kundorder_reversering','svinn','justering','inventering']));

CREATE OR REPLACE FUNCTION public.fortnox_on_invoice_cancelled(p_order_id uuid, p_entity text, p_document_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Spegla exakt de kolumner som fortnox_on_invoice_created skriver till stock_movements.
  insert into public.stock_movements
    (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
     reference_type, reference_id, reference_line_id, note, legal_entity_id)
  select sm.product_id, sm.location_id, sm.lot_id, 'kundorder_reversering',
         -sm.quantity_kg, sm.unit_cost,
         'fortnox_invoice_reversal', sm.reference_id, sm.reference_line_id,
         'Reversering: Fortnox faktura ' || p_document_number || ' annullerad',
         sm.legal_entity_id
  from public.stock_movements sm
  where sm.reference_type = 'fortnox_invoice'
    and sm.reference_id = p_order_id
    and not exists (
      select 1 from public.stock_movements r
      where r.reference_type = 'fortnox_invoice_reversal'
        and r.reference_id = sm.reference_id
        and (
          (r.reference_line_id is not null and r.reference_line_id = sm.reference_line_id)
          or (r.reference_line_id is null and sm.reference_line_id is null and r.product_id = sm.product_id)
        )
    );

  -- Frigör orderraderna så att ordern kan faktureras om.
  update public.customer_order_lines ol
     set movement_id = null
   where ol.customer_order_id = p_order_id
     and ol.movement_id in (
       select sm.id from public.stock_movements sm
       where sm.reference_type = 'fortnox_invoice' and sm.reference_id = p_order_id
     );

  insert into public.customer_order_events (customer_order_id, event_type, description, new_value)
  select p_order_id, 'faktura_annullerad',
         'Faktura ' || p_document_number || ' annullerad i Fortnox (' || p_entity || '), lager återfört',
         jsonb_build_object('document_number', p_document_number, 'legal_entity_code', p_entity)
  where not exists (
    select 1 from public.customer_order_events e
    where e.customer_order_id = p_order_id
      and e.event_type = 'faktura_annullerad'
      and e.new_value->>'document_number' = p_document_number
  );
end
$function$;

REVOKE ALL ON FUNCTION public.fortnox_on_invoice_cancelled(uuid,text,text) FROM public, anon, authenticated;