ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_line_id uuid;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_line
  ON public.stock_movements (reference_line_id) WHERE reference_line_id IS NOT NULL;

-- Backfill: koppla befintliga Fortnox-rörelser till orderrad när det är entydigt
WITH cand AS (
  SELECT sm.id AS sm_id, ol.id AS ol_id,
         row_number() OVER (PARTITION BY sm.reference_id, sm.product_id ORDER BY ol.created_at, ol.id) AS rn,
         count(*) OVER (PARTITION BY sm.reference_id, sm.product_id) AS n
  FROM public.stock_movements sm
  JOIN public.customer_order_lines ol
    ON ol.customer_order_id = sm.reference_id AND ol.product_id = sm.product_id
  WHERE sm.reference_type = 'fortnox_invoice' AND sm.reference_line_id IS NULL
)
UPDATE public.stock_movements sm
SET reference_line_id = c.ol_id
FROM cand c
WHERE sm.id = c.sm_id AND c.n = 1 AND c.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_fortnox_line
  ON public.stock_movements (reference_line_id)
  WHERE reference_type = 'fortnox_invoice' AND reference_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fortnox_on_invoice_created(p_order_id uuid, p_entity text, p_document_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare v_location uuid; v_store uuid;
begin
  select o.store_id into v_store from public.customer_orders o where o.id = p_order_id;
  if v_store is null then raise exception 'Order % hittades inte', p_order_id; end if;

  select coalesce(
    (select s.inventory_location_id from public.stores s where s.id = v_store),
    (select l.id from public.storage_locations l
      where l.store_id = v_store and l.active and l.parent_location_id is null
      order by l.created_at limit 1)
  ) into v_location;

  if v_location is not null then
    insert into public.stock_movements
      (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
       reference_type, reference_id, reference_line_id, note, legal_entity_id)
    select ol.product_id, v_location, ol.reserved_lot_id, 'kundorder',
           -abs(coalesce(ol.quantity_packed, ol.quantity_ordered)), ol.cost_at_order,
           'fortnox_invoice', p_order_id, ol.id,
           'Fortnox faktura ' || p_document_number, p_entity
    from public.customer_order_lines ol
    where ol.customer_order_id = p_order_id
      and ol.product_id is not null
      and ol.movement_id is null
      and coalesce(ol.pack_status,'') <> 'struken'
      and coalesce(ol.quantity_packed, ol.quantity_ordered) > 0
      -- exakt en rörelse per orderrad
      and not exists (
        select 1 from public.stock_movements sm
        where sm.reference_type = 'fortnox_invoice'
          and sm.reference_line_id = ol.id
      )
      -- äldre rörelser utan radkoppling räknas som redan bokförda
      and not exists (
        select 1 from public.stock_movements sm
        where sm.reference_type = 'fortnox_invoice'
          and sm.reference_id = p_order_id
          and sm.reference_line_id is null
          and sm.product_id = ol.product_id
      );
  end if;

  insert into public.customer_order_events (customer_order_id, event_type, description, new_value)
  select p_order_id, 'fakturerad', 'Faktura ' || p_document_number || ' skapad i Fortnox (' || p_entity || ')',
         jsonb_build_object('document_number', p_document_number, 'legal_entity_code', p_entity)
  where not exists (
    select 1 from public.customer_order_events e
    where e.customer_order_id = p_order_id
      and e.event_type = 'fakturerad'
      and e.new_value->>'document_number' = p_document_number
  );
end
$function$;