-- 1) FEFO-partival: partiet som går ut först och har saldo på lagerplatsen.
CREATE OR REPLACE FUNCTION public.pick_lot_fefo(_product_id uuid, _location_id uuid, _quantity numeric)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with bal as (
    select sm.lot_id, sum(sm.quantity_kg) as qty
    from public.stock_movements sm
    where sm.product_id = _product_id
      and sm.location_id = _location_id
      and sm.lot_id is not null
    group by sm.lot_id
    having sum(sm.quantity_kg) > 0.0001
  )
  select b.lot_id
  from bal b
  join public.lots l on l.id = b.lot_id
  order by
    -- först partier som täcker hela mängden
    (b.qty >= coalesce(_quantity, 0) - 0.0001) desc,
    l.best_before asc nulls last,
    l.created_at asc
  limit 1
$$;

GRANT EXECUTE ON FUNCTION public.pick_lot_fefo(uuid, uuid, numeric) TO authenticated, service_role;

-- 2) Fakturering bokför aldrig ett uttag utan parti för en spårbar vara.
CREATE OR REPLACE FUNCTION public.fortnox_on_invoice_created(p_order_id uuid, p_entity text, p_document_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_location uuid;
  v_store uuid;
  r record;
  v_lot uuid;
  v_qty numeric;
  v_has_lots boolean;
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
    for r in
      select ol.*
      from public.customer_order_lines ol
      where ol.customer_order_id = p_order_id
        and ol.product_id is not null
        and ol.movement_id is null
        and coalesce(ol.pack_status,'') <> 'struken'
        and coalesce(ol.quantity_packed, ol.quantity_ordered) > 0
        and not exists (
          select 1 from public.stock_movements sm
          where sm.reference_type = 'fortnox_invoice'
            and sm.reference_line_id = ol.id
        )
        and not exists (
          select 1 from public.stock_movements sm
          where sm.reference_type = 'fortnox_invoice'
            and sm.reference_id = p_order_id
            and sm.reference_line_id is null
            and sm.product_id = ol.product_id
        )
      order by ol.sort_order nulls last, ol.created_at
    loop
      v_qty := abs(coalesce(r.quantity_packed, r.quantity_ordered));

      -- Reservationen gäller om den finns, annars väljs partiet som går ut först.
      v_lot := r.reserved_lot_id;
      if v_lot is null then
        v_lot := public.pick_lot_fefo(r.product_id, v_location, v_qty);
      end if;

      if v_lot is null then
        -- Har varan partier alls? Då krävs ett parti — annars bryts spårbarheten.
        select exists (select 1 from public.lots l where l.product_id = r.product_id)
          into v_has_lots;
        if v_has_lots then
          raise exception
            'Spårbarhet saknas: raden % går inte att koppla till något parti på lagret. Bokför inleverans eller reservera parti innan fakturering.',
            coalesce((select p.name from public.products p where p.id = r.product_id), r.product_id::text);
        end if;
      end if;

      insert into public.stock_movements
        (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
         reference_type, reference_id, reference_line_id, note, legal_entity_id)
      values
        (r.product_id, v_location, v_lot, 'kundorder', -v_qty, r.cost_at_order,
         'fortnox_invoice', p_order_id, r.id,
         'Fortnox faktura ' || p_document_number, p_entity);
    end loop;
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

-- 3) Spårbarhetskontrollen. Samma definition av "korrekt" för sida och tester.
CREATE OR REPLACE FUNCTION public.traceability_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_balance jsonb;
  v_no_lot jsonb;
  v_no_ref jsonb;
  v_lots jsonb;
  v_negative jsonb;
  v_sample jsonb;
begin
  -- a) Saldo mot rörelser
  with m as (
    select product_id, location_id, sum(quantity_kg) q
    from public.stock_movements group by 1,2
  ), d as (
    select coalesce(p.product_id, m.product_id) product_id,
           coalesce(p.location_id, m.location_id) location_id,
           coalesce(p.quantity,0) saldo, coalesce(m.q,0) rorelser
    from public.product_stock_locations p
    full join m on m.product_id = p.product_id and m.location_id = p.location_id
  )
  select jsonb_build_object(
    'rows', (select count(*) from d),
    'mismatched', (select count(*) from d where abs(saldo - rorelser) > 0.05),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product', pr.name, 'location', sl.name,
        'saldo', round(d.saldo::numeric,2), 'movements', round(d.rorelser::numeric,2)))
      from d
      left join public.products pr on pr.id = d.product_id
      left join public.storage_locations sl on sl.id = d.location_id
      where abs(d.saldo - d.rorelser) > 0.05
    ), '[]'::jsonb)
  ) into v_balance;

  -- b) Uttag utan parti, per flöde
  select coalesce(jsonb_agg(x order by (x->>'without_lot')::int desc), '[]'::jsonb) into v_no_lot
  from (
    select jsonb_build_object(
      'movement_type', sm.movement_type,
      'total', count(*),
      'without_lot', count(*) filter (where sm.lot_id is null),
      'kg_without_lot', round(abs(coalesce(sum(sm.quantity_kg) filter (where sm.lot_id is null),0))::numeric,1)
    ) x
    from public.stock_movements sm
    where sm.movement_type in ('kundorder','forsaljning','overforing_ut','tillverkning_ut','svinn')
    group by sm.movement_type
    having count(*) filter (where sm.lot_id is null) > 0
  ) s;

  -- c) Rörelser utan underlagsreferens
  select coalesce(jsonb_agg(x order by (x->>'without_reference')::int desc), '[]'::jsonb) into v_no_ref
  from (
    select jsonb_build_object(
      'movement_type', movement_type,
      'without_reference', count(*)
    ) x
    from public.stock_movements
    where reference_type is null
    group by movement_type
  ) s;

  -- d) Partier med ofullständig ursprungsinformation
  select jsonb_build_object(
    'total', count(*),
    'incomplete', count(*) filter (where
      l.latin_name is null or l.catch_area is null or l.production_method is null
      or l.supplier_id is null or l.best_before is null),
    'missing_latin', count(*) filter (where l.latin_name is null),
    'missing_area', count(*) filter (where l.catch_area is null),
    'missing_method', count(*) filter (where l.production_method is null),
    'missing_supplier', count(*) filter (where l.supplier_id is null),
    'missing_best_before', count(*) filter (where l.best_before is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('lot_number', x.lot_number, 'missing', x.missing))
      from (
        select l2.lot_number,
          array_remove(array[
            case when l2.latin_name is null then 'art' end,
            case when l2.catch_area is null then 'fångstområde' end,
            case when l2.production_method is null then 'metod' end,
            case when l2.supplier_id is null then 'leverantör' end,
            case when l2.best_before is null then 'bäst före' end
          ], null) missing
        from public.lots l2
        where l2.latin_name is null or l2.catch_area is null or l2.production_method is null
          or l2.supplier_id is null or l2.best_before is null
        order by l2.created_at desc
        limit 50
      ) x
    ), '[]'::jsonb)
  ) into v_lots
  from public.lots l;

  -- e) Negativa saldon
  select jsonb_build_object(
    'count', count(*),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('product', pr.name, 'location', sl.name,
                                          'quantity', round(p2.quantity::numeric,2)))
      from public.product_stock_locations p2
      left join public.products pr on pr.id = p2.product_id
      left join public.storage_locations sl on sl.id = p2.location_id
      where p2.quantity < -0.005
    ), '[]'::jsonb)
  ) into v_negative
  from public.product_stock_locations p where p.quantity < -0.005;

  -- f) Stickprov: fem senaste uttagen följs bakåt mot parti och ursprung
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_sample
  from (
    select jsonb_build_object(
      'created_at', sm.created_at,
      'movement_type', sm.movement_type,
      'product', pr.name,
      'location', sl.name,
      'quantity', round(abs(sm.quantity_kg)::numeric,1),
      'reference', sm.reference_type,
      'note', sm.note,
      'lot_number', l.lot_number,
      'catch_area', l.catch_area,
      'vessel', l.vessel_name,
      'supplier', sup.name,
      'ok', (l.id is not null and l.catch_area is not null and l.supplier_id is not null),
      'broken_at', case
        when l.id is null then 'inget parti på rörelsen'
        when l.supplier_id is null then 'partiet saknar leverantör'
        when l.catch_area is null then 'partiet saknar fångstområde'
        else null end
    ) x
    from public.stock_movements sm
    left join public.products pr on pr.id = sm.product_id
    left join public.storage_locations sl on sl.id = sm.location_id
    left join public.lots l on l.id = sm.lot_id
    left join public.suppliers sup on sup.id = l.supplier_id
    where sm.movement_type in ('kundorder','forsaljning')
    order by sm.created_at desc
    limit 5
  ) s;

  return jsonb_build_object(
    'generated_at', now(),
    'balance', v_balance,
    'movements_without_lot', v_no_lot,
    'movements_without_reference', v_no_ref,
    'lots', v_lots,
    'negative_stock', v_negative,
    'sample_chains', v_sample
  );
end
$function$;

GRANT EXECUTE ON FUNCTION public.traceability_report() TO authenticated, service_role;

-- 4) Kedjan bakåt och framåt utifrån partinummer, ordernummer eller fakturanummer.
CREATE OR REPLACE FUNCTION public.traceability_lookup(_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  q text := btrim(coalesce(_query,''));
  v_lot_ids uuid[];
  v_order_ids uuid[];
  v_result jsonb;
begin
  if q = '' then return jsonb_build_object('query', q, 'found', false); end if;

  -- Partinummer
  select array_agg(id) into v_lot_ids from public.lots where lot_number ilike '%'||q||'%';

  -- Ordernummer eller fakturanummer
  select array_agg(o.id) into v_order_ids
  from public.customer_orders o
  where o.order_number ilike '%'||q||'%'
     or exists (
       select 1 from public.customer_order_events e
       where e.customer_order_id = o.id and e.new_value->>'document_number' = q
     );

  -- Partier som berörs av ordrarna
  if v_order_ids is not null then
    select coalesce(v_lot_ids, '{}'::uuid[]) || coalesce(array_agg(distinct sm.lot_id), '{}'::uuid[])
      into v_lot_ids
    from public.stock_movements sm
    where sm.reference_id = any(v_order_ids) and sm.lot_id is not null;
  end if;

  select jsonb_build_object(
    'query', q,
    'found', (coalesce(array_length(v_lot_ids,1),0) > 0 or coalesce(array_length(v_order_ids,1),0) > 0),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lot_number', l.lot_number,
        'product', pr.name,
        'latin_name', l.latin_name,
        'catch_area', l.catch_area,
        'vessel', l.vessel_name,
        'production_method', l.production_method,
        'best_before', l.best_before,
        'supplier', sup.name,
        'received_at', l.created_at))
      from public.lots l
      left join public.products pr on pr.id = l.product_id
      left join public.suppliers sup on sup.id = l.supplier_id
      where l.id = any(v_lot_ids)
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', sm.created_at,
        'movement_type', sm.movement_type,
        'product', pr.name,
        'location', sl.name,
        'quantity', round(sm.quantity_kg::numeric,1),
        'lot_number', l.lot_number,
        'reference', sm.reference_type,
        'note', sm.note) order by sm.created_at)
      from public.stock_movements sm
      left join public.products pr on pr.id = sm.product_id
      left join public.storage_locations sl on sl.id = sm.location_id
      left join public.lots l on l.id = sm.lot_id
      where sm.lot_id = any(v_lot_ids)
         or (v_order_ids is not null and sm.reference_id = any(v_order_ids))
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number,
        'status', o.status,
        'wanted_date', o.wanted_date,
        'customer', o.customer_name,
        'store', st.name,
        'invoice', (
          select e.new_value->>'document_number' from public.customer_order_events e
          where e.customer_order_id = o.id and e.event_type = 'fakturerad'
          order by e.created_at desc limit 1)))
      from public.customer_orders o
      left join public.stores st on st.id = o.store_id
      where v_order_ids is not null and o.id = any(v_order_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

GRANT EXECUTE ON FUNCTION public.traceability_lookup(text) TO authenticated, service_role;