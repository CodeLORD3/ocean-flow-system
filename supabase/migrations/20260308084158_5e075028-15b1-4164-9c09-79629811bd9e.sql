
CREATE TABLE public.shop_order_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  order_line_id uuid REFERENCES public.shop_order_lines(id) ON DELETE CASCADE,
  change_type text NOT NULL, -- 'quantity_change', 'add_line', 'delivery_date'
  product_id uuid REFERENCES public.products(id),
  old_value text,
  new_value text NOT NULL,
  unit text,
  status text NOT NULL DEFAULT 'Väntande', -- Väntande, Godkänd, Nekad
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by text
);

ALTER TABLE public.shop_order_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.shop_order_change_requests FOR ALL USING (true) WITH CHECK (true);
