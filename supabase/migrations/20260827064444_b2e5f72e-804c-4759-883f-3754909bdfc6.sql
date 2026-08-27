with li as (
  select distinct on (l->>'id') l->>'id' as lid, coalesce(l->>'title','') as title, coalesce(l->>'variant_title','') as vt,
         coalesce(l->>'name','') as nm, coalesce(l->>'sku','') as sku,
         coalesce((l->>'grams')::numeric,0) as grams, (l->>'quantity')::numeric as packs
  from shopify_webhook_events e, jsonb_array_elements(e.payload->'line_items') l
  where e.payload ? 'line_items'
), pk as (
  select lid, packs,
    case
      when lower(title||' '||vt||' '||nm||' '||sku) ~ '(^|[^0-9])1\s*/\s*2\s*kg' then 0.5
      when lower(title||' '||vt||' '||nm||' '||sku) ~ '[0-9]([.,][0-9]+)?\s*\.?\s*kg'
        then replace((regexp_match(lower(title||' '||vt||' '||nm||' '||sku),'([0-9]+([.,][0-9]+)?)\s*\.?\s*kg'))[1],',','.')::numeric
      when lower(title||' '||vt||' '||nm||' '||sku) ~ '[0-9]([.,][0-9]+)?\s*g'
        then replace((regexp_match(lower(title||' '||vt||' '||nm||' '||sku),'([0-9]+([.,][0-9]+)?)\s*g'))[1],',','.')::numeric/1000
      when grams > 0 then grams/1000
      else 1
    end as pack
  from li
), fix as (
  select ol.id,
         round(pk.packs * pk.pack, 3) as new_qty,
         case when round(pk.packs * pk.pack, 3) > 0
              then round(ol.line_total / round(pk.packs * pk.pack, 3), 2) end as new_price,
         ol.reserved_quantity, ol.reservation_status
  from customer_order_lines ol
  join customer_orders co on co.id = ol.customer_order_id
  join products p on p.id = ol.product_id
  join pk on pk.lid = ol.shopify_line_id
  where p.unit = 'kg'
    and ol.pack_status = 'opackad'
    and abs(ol.quantity_ordered - pk.packs * pk.pack) > 0.001
    and round(pk.packs * pk.pack, 3) > 0
)
update customer_order_lines ol
set quantity_ordered = fix.new_qty,
    paid_quantity = fix.new_qty,
    estimated_price_per_unit = fix.new_price,
    price_per_unit = fix.new_price,
    reserved_quantity = case when ol.reservation_status = 'reserverad' then fix.new_qty else ol.reserved_quantity end
from fix
where fix.id = ol.id;