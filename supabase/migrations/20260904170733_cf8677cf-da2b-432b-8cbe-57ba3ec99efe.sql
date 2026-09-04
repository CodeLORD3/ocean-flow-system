REVOKE EXECUTE ON FUNCTION public.auto_trace_purchase_report(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.trace_lot_to_invoices(_lot_id uuid)
RETURNS TABLE (
  lot_id uuid,
  lot_number text,
  supplier_lot_id text,
  product_name text,
  purchase_report_id uuid,
  purchase_date date,
  supplier_name text,
  vessel_name text,
  catch_area text,
  movement_id uuid,
  movement_type text,
  movement_at timestamptz,
  order_id uuid,
  order_number text,
  fortnox_document_number text,
  invoice_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.id, l.lot_number, l.supplier_lot_id, p.name,
         pr.id, COALESCE(pr.document_date, prl.purchase_date),
         COALESCE(pr.supplier_name_raw, prl.supplier_name), l.vessel_name, l.catch_area,
         sm.id, sm.movement_type, sm.created_at,
         CASE WHEN sm.reference_type = 'shop_order' THEN sm.reference_id ELSE NULL END,
         CASE WHEN so.id IS NOT NULL THEN 'BUT-' || upper(left(replace(so.id::text, '-', ''), 8)) ELSE NULL END,
         fij.fortnox_document_number,
         fij.status
  FROM public.lots l
  JOIN public.products p ON p.id = l.product_id
  LEFT JOIN public.purchase_report_lines prl ON prl.lot_id = l.id
  LEFT JOIN public.purchase_reports pr ON pr.id = prl.report_id
  LEFT JOIN public.stock_movements sm ON sm.lot_id = l.id
  LEFT JOIN public.shop_orders so
    ON sm.reference_type = 'shop_order' AND so.id = sm.reference_id
  LEFT JOIN public.fortnox_invoice_jobs fij
    ON fij.order_id = so.id AND fij.order_kind = 'shop_order'
  WHERE l.id = _lot_id
  ORDER BY sm.created_at, sm.id;
$$;
REVOKE ALL ON FUNCTION public.trace_lot_to_invoices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trace_lot_to_invoices(uuid) TO authenticated, service_role;