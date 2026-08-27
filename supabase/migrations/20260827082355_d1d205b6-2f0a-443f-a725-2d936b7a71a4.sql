CREATE OR REPLACE FUNCTION public.fortnox_build_invoice_input(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; v_entity text;
begin
  select coalesce(public.company_of_store(o.store_id, o.wanted_date), s.legal_entity_id)
    into v_entity
  from public.customer_orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id;

  if v_entity is null then raise exception 'Order % saknar bolagstillhörighet', p_order_id; end if;

  select jsonb_build_object(
    'legal_entity_code', v_entity,
    'customer_id',       o.customer_id,
    'customer_number',   m.fortnox_customer_number,
    'order_number',      o.order_number,
    'invoice_date',      to_char(current_date, 'YYYY-MM-DD'),
    'due_date',          to_char(current_date + 30, 'YYYY-MM-DD'),
    'currency',          coalesce(o.currency, s.currency, 'SEK'),
    'vat_included',      true,
    'our_reference',     o.received_by_name,
    'your_reference',    coalesce(cr.contact_reference, o.customer_name_snapshot),
    'remarks',           o.note,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',     ol.product_id,
        'article_number', coalesce(p.sku, 'MKR-' || left(replace(ol.product_id::text,'-',''), 20)),
        'description',    coalesce(nullif(ol.free_text_name,''), p.name, 'Vara'),
        'quantity',       coalesce(ol.quantity_packed, ol.quantity_ordered),
        'unit',           coalesce(ol.unit, p.unit, 'kg'),
        'price',          coalesce(ol.price_per_unit, ol.estimated_price_per_unit, 0),
        'vat_rate',       public.fortnox_vat_rate(v_entity, p.category),
        'ean',            p.barcode,
        'hs_code',        p.hs_code,
        'cost_center',    null
      ) order by ol.sort_order nulls last, ol.created_at)
      from public.customer_order_lines ol
      left join public.products p on p.id = ol.product_id
      where ol.customer_order_id = o.id
        -- Endast rader som faktiskt är packade får faktureras.
        -- Strukna och restnoterade (ej tillgängliga) rader utesluts.
        and coalesce(ol.pack_status,'') not in ('struken','restnoterad')
        and coalesce(ol.quantity_packed, ol.quantity_ordered) > 0
    ), '[]'::jsonb)
  )
  into v
  from public.customer_orders o
  join public.stores s on s.id = o.store_id
  left join public.customers_retail cr on cr.id = o.customer_id
  left join public.fortnox_customer_map m
    on m.makrilltrade_customer_id = o.customer_id and m.legal_entity_code = v_entity
  where o.id = p_order_id;

  if v is null then raise exception 'Order % hittades inte', p_order_id; end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.fortnox_build_shop_invoice_input(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
  v_entity text := 'fsab-se';
begin
  select jsonb_build_object(
    'legal_entity_code', v_entity,
    'store_id',          o.store_id,
    'customer_number',   s.fortnox_customer_number,
    'order_number',      'BUT-' || upper(left(replace(o.id::text, '-', ''), 8)),
    'invoice_date',      to_char(current_date, 'YYYY-MM-DD'),
    'due_date',          to_char(current_date + 30, 'YYYY-MM-DD'),
    'currency',          coalesce(s.currency, 'SEK'),
    'vat_included',      false,
    'our_reference',     o.packer_name,
    'your_reference',    s.name,
    'remarks',           o.notes,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',     ol.product_id,
        'article_number', coalesce(p.sku, 'MKR-' || left(replace(ol.product_id::text, '-', ''), 20)),
        'description',    coalesce(p.name, 'Vara'),
        'quantity',       ol.quantity_delivered,
        'unit',           coalesce(ol.unit, p.unit, 'kg'),
        'price',          coalesce(p.wholesale_price, 0),
        'vat_rate',       public.fortnox_vat_rate(v_entity, p.category),
        'ean',            p.barcode,
        'hs_code',        p.hs_code
      ) order by p.name)
      from public.shop_order_lines ol
      left join public.products p on p.id = ol.product_id
      where ol.shop_order_id = o.id
        -- Rader markerade "Ej tillgänglig" ska aldrig faktureras.
        and coalesce(ol.status,'') <> 'Ej tillgänglig'
        and coalesce(ol.quantity_delivered, 0) > 0
    ), '[]'::jsonb)
  )
  into v
  from public.shop_orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id;

  if v is null then raise exception 'Butiksorder % hittades inte', p_order_id; end if;
  return v;
end
$function$;