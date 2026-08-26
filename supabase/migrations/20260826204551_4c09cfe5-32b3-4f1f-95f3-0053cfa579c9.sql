ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS fortnox_customer_number text;

ALTER TABLE public.fortnox_invoice_jobs
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'customer_order';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fortnox_invoice_jobs_order_kind_check'
  ) THEN
    ALTER TABLE public.fortnox_invoice_jobs
      ADD CONSTRAINT fortnox_invoice_jobs_order_kind_check
      CHECK (order_kind IN ('customer_order', 'shop_order'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fortnox_build_shop_invoice_input(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v jsonb;
  v_entity text := 'fsab-se'; -- Grossist Göteborg (FSAB SE) är säljare på butiksordrar
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
$$;

REVOKE ALL ON FUNCTION public.fortnox_build_shop_invoice_input(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fortnox_build_shop_invoice_input(uuid) TO service_role;