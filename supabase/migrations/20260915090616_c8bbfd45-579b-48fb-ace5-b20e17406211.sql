create or replace function public.get_lineage(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seed uuid[] := '{}';
  v_lots uuid[] := '{}';
  v_nodes jsonb := '[]'::jsonb;
  v_edges jsonb := '[]'::jsonb;
begin
  if p_entity_type = 'lot' then
    v_seed := array[p_entity_id];
  elsif p_entity_type = 'transformation' then
    select array_remove(array[t.source_lot_id, t.target_lot_id], null) into v_seed
    from stock_transformations t where t.id = p_entity_id;
  elsif p_entity_type = 'transfer' then
    select coalesce(array_agg(distinct l.lot_id), '{}') into v_seed
    from transfer_order_lines l where l.transfer_order_id = p_entity_id and l.lot_id is not null;
  elsif p_entity_type = 'waste' then
    select coalesce(array_agg(distinct l.lot_id), '{}') into v_seed
    from waste_report_lines l where l.waste_report_id = p_entity_id and l.lot_id is not null;
  elsif p_entity_type = 'customer_order' then
    select coalesce(array_agg(distinct l.reserved_lot_id), '{}') into v_seed
    from customer_order_lines l where l.customer_order_id = p_entity_id and l.reserved_lot_id is not null;
  elsif p_entity_type = 'location' then
    select coalesce(array_agg(distinct m.lot_id), '{}') into v_seed
    from (
      select lot_id from stock_movements
      where location_id = p_entity_id and lot_id is not null
      order by created_at desc limit 200
    ) m;
  end if;

  v_seed := coalesce(v_seed, '{}');
  if array_length(v_seed, 1) is null then
    return jsonb_build_object('nodes', '[]'::jsonb, 'edges', '[]'::jsonb);
  end if;

  with recursive g(lot_id) as (
    select unnest(v_seed)
    union
    select case when t.source_lot_id = g.lot_id then t.target_lot_id else t.source_lot_id end
    from stock_transformations t
    join g on g.lot_id in (t.source_lot_id, t.target_lot_id)
    where t.source_lot_id is not null and t.target_lot_id is not null
  )
  select coalesce(array_agg(distinct lot_id), '{}') into v_lots from g where lot_id is not null;

  -- Partier (inköp/mottagning/batch)
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select jsonb_build_object(
      'type', 'lot',
      'id', l.id,
      'category', case when exists (select 1 from stock_transformations t where t.target_lot_id = l.id)
                       then 'batch' else 'inkop' end,
      'title', coalesce(l.commercial_name, p.name, 'Parti'),
      'subtitle', l.lot_number,
      'quantity', l.quantity_kg,
      'unit', 'kg',
      'amount', l.unit_cost,
      'date', l.created_at,
      'meta', jsonb_build_object(
        'latin_name', l.latin_name,
        'species_fao_code', l.species_fao_code,
        'catch_area', l.catch_area,
        'fishing_gear', l.fishing_gear,
        'vessel_name', l.vessel_name,
        'best_before', l.best_before,
        'status', l.status,
        'price_status', l.price_status,
        'invoice_number', l.invoice_number,
        'is_thawed', l.is_thawed,
        'incoming_catch_cert', l.incoming_catch_cert,
        'product', p.name,
        'supplier_lot_id', l.supplier_lot_id
      )
    ) as n
    from lots l
    left join products p on p.id = l.product_id
    where l.id = any(v_lots)
  ) x;

  -- Omvandlingar
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select jsonb_build_object(
      'type', 'transformation',
      'id', t.id,
      'category', 'omvandling',
      'title', coalesce(t.transform_kind, 'Omvandling'),
      'subtitle', coalesce(sp.name, '') || ' → ' || coalesce(tp.name, ''),
      'quantity', t.target_quantity,
      'unit', 'kg',
      'date', coalesce(t.performed_at, t.created_at),
      'meta', jsonb_build_object(
        'source_quantity', t.source_quantity,
        'target_quantity', t.target_quantity,
        'target_packages', t.target_packages,
        'yield_pct', t.yield_pct,
        'waste_quantity', t.waste_quantity,
        'waste_reason', t.waste_reason,
        'performed_by_name', t.performed_by_name,
        'note', t.note
      )
    ) as n
    from stock_transformations t
    left join products sp on sp.id = t.source_product_id
    left join products tp on tp.id = t.target_product_id
    where t.source_lot_id = any(v_lots) or t.target_lot_id = any(v_lots)
  ) x;

  select v_edges || coalesce(jsonb_agg(e), '[]'::jsonb) into v_edges
  from (
    select jsonb_build_object('from_type','lot','from_id',t.source_lot_id,'to_type','transformation','to_id',t.id,
                              'relation','in','quantity',t.source_quantity,'unit','kg') as e
    from stock_transformations t
    where t.source_lot_id is not null and (t.source_lot_id = any(v_lots) or t.target_lot_id = any(v_lots))
    union all
    select jsonb_build_object('from_type','transformation','from_id',t.id,'to_type','lot','to_id',t.target_lot_id,
                              'relation','out','quantity',t.target_quantity,'unit','kg')
    from stock_transformations t
    where t.target_lot_id is not null and (t.source_lot_id = any(v_lots) or t.target_lot_id = any(v_lots))
  ) x;

  -- Transporter och lagerplatser
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select distinct on (o.id) jsonb_build_object(
      'type', 'transfer',
      'id', o.id,
      'category', 'transport',
      'title', coalesce(o.order_number, 'Överföring'),
      'subtitle', coalesce(fl.name, '?') || ' → ' || coalesce(tl.name, '?'),
      'unit', 'kg',
      'date', coalesce(o.approved_out_at, o.created_at),
      'meta', jsonb_build_object(
        'status', o.status,
        'is_intercompany', o.is_intercompany,
        'from_location', fl.name,
        'to_location', tl.name,
        'seal_number', o.seal_number,
        'catch_certificate_ref', o.catch_certificate_ref
      )
    ) as n
    from transfer_orders o
    join transfer_order_lines tl2 on tl2.transfer_order_id = o.id and tl2.lot_id = any(v_lots)
    left join storage_locations fl on fl.id = o.from_location_id
    left join storage_locations tl on tl.id = o.to_location_id
  ) x;

  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select distinct on (sl.id) jsonb_build_object(
      'type', 'location',
      'id', sl.id,
      'category', case when sl.location_type::text = 'butik' then 'butik' else 'lager' end,
      'title', sl.name,
      'subtitle', coalesce(st.name, sl.zone),
      'date', null,
      'meta', jsonb_build_object('location_type', sl.location_type, 'store', st.name, 'zone', sl.zone)
    ) as n
    from storage_locations sl
    left join stores st on st.id = sl.store_id
    where sl.id in (
      select o.from_location_id from transfer_orders o
        join transfer_order_lines l on l.transfer_order_id = o.id and l.lot_id = any(v_lots)
      union
      select o.to_location_id from transfer_orders o
        join transfer_order_lines l on l.transfer_order_id = o.id and l.lot_id = any(v_lots)
      union
      select w.location_id from waste_reports w
        join waste_report_lines wl on wl.waste_report_id = w.id and wl.lot_id = any(v_lots)
    )
  ) x;

  select v_edges || coalesce(jsonb_agg(e), '[]'::jsonb) into v_edges
  from (
    select jsonb_build_object('from_type','lot','from_id',l.lot_id,'to_type','transfer','to_id',o.id,
                              'relation','transport','quantity',coalesce(l.quantity_shipped,l.quantity_ordered),'unit','kg') as e
    from transfer_order_lines l join transfer_orders o on o.id = l.transfer_order_id
    where l.lot_id = any(v_lots)
    union all
    select jsonb_build_object('from_type','transfer','from_id',o.id,'to_type','location','to_id',o.to_location_id,
                              'relation','mottagen','quantity',null,'unit','kg')
    from transfer_orders o
    join transfer_order_lines l on l.transfer_order_id = o.id and l.lot_id = any(v_lots)
    where o.to_location_id is not null
  ) x;

  -- Svinn
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select distinct on (w.id) jsonb_build_object(
      'type','waste','id',w.id,'category','svinn',
      'title', coalesce(w.reason, 'Svinn'),
      'subtitle', sl.name,
      'unit','kg',
      'date', w.created_at,
      'meta', jsonb_build_object('comment', w.comment, 'location', sl.name)
    ) as n
    from waste_reports w
    join waste_report_lines wl on wl.waste_report_id = w.id and wl.lot_id = any(v_lots)
    left join storage_locations sl on sl.id = w.location_id
  ) x;

  select v_edges || coalesce(jsonb_agg(e), '[]'::jsonb) into v_edges
  from (
    select jsonb_build_object('from_type','lot','from_id',wl.lot_id,'to_type','waste','to_id',wl.waste_report_id,
                              'relation','svinn','quantity',wl.quantity_kg,'unit','kg') as e
    from waste_report_lines wl where wl.lot_id = any(v_lots)
  ) x;

  -- Kundorder
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select distinct on (co.id) jsonb_build_object(
      'type','customer_order','id',co.id,'category','kundorder',
      'title', coalesce(co.order_number, 'Kundorder'),
      'subtitle', coalesce(co.customer_name_snapshot, st.name),
      'amount', coalesce(co.total_incl_vat, co.estimated_total),
      'date', coalesce(co.packed_at, co.created_at),
      'meta', jsonb_build_object('status', co.status, 'pack_status', co.pack_status, 'store', st.name, 'source', co.source)
    ) as n
    from customer_orders co
    join customer_order_lines col on col.customer_order_id = co.id and col.reserved_lot_id = any(v_lots)
    left join stores st on st.id = co.store_id
  ) x;

  select v_edges || coalesce(jsonb_agg(e), '[]'::jsonb) into v_edges
  from (
    select jsonb_build_object('from_type','lot','from_id',col.reserved_lot_id,'to_type','customer_order','to_id',col.customer_order_id,
                              'relation','order','quantity',coalesce(col.quantity_packed,col.quantity_ordered),'unit',col.unit) as e
    from customer_order_lines col where col.reserved_lot_id = any(v_lots)
  ) x;

  -- Inventering och justering
  select v_nodes || coalesce(jsonb_agg(n), '[]'::jsonb) into v_nodes
  from (
    select jsonb_build_object(
      'type','movement','id',m.id,'category','inventering',
      'title', m.movement_type,
      'subtitle', sl.name,
      'quantity', m.quantity_kg,
      'unit','kg',
      'date', m.created_at,
      'meta', jsonb_build_object('note', m.note, 'reference_type', m.reference_type, 'location', sl.name)
    ) as n
    from stock_movements m
    left join storage_locations sl on sl.id = m.location_id
    where m.lot_id = any(v_lots) and m.movement_type in ('inventering','justering')
  ) x;

  select v_edges || coalesce(jsonb_agg(e), '[]'::jsonb) into v_edges
  from (
    select jsonb_build_object('from_type','lot','from_id',m.lot_id,'to_type','movement','to_id',m.id,
                              'relation','inventering','quantity',m.quantity_kg,'unit','kg') as e
    from stock_movements m
    where m.lot_id = any(v_lots) and m.movement_type in ('inventering','justering')
  ) x;

  return jsonb_build_object('nodes', v_nodes, 'edges', v_edges, 'seed_lots', to_jsonb(v_lots));
end;
$$;

grant execute on function public.get_lineage(text, uuid) to authenticated;
grant execute on function public.get_lineage(text, uuid) to service_role;