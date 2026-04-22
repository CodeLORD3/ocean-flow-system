-- Helper function for updated_at (create if missing)
CREATE OR REPLACE FUNCTION public.pos_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.pos_cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  pin_hash text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier','shift_lead','manager')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  erp_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL,
  vat_rate numeric NOT NULL DEFAULT 12,
  unit_type text NOT NULL DEFAULT 'piece' CHECK (unit_type IN ('piece','kg','custom')),
  price_ore integer NOT NULL DEFAULT 0,
  image_url text,
  barcode text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_products_category ON public.pos_products(category) WHERE active;
CREATE INDEX idx_pos_products_barcode ON public.pos_products(barcode) WHERE barcode IS NOT NULL;

CREATE TABLE public.pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES public.pos_cashiers(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_float_ore integer NOT NULL DEFAULT 0,
  closing_cash_ore integer,
  notes text
);
CREATE INDEX idx_pos_shifts_open ON public.pos_shifts(cashier_id) WHERE closed_at IS NULL;

CREATE SEQUENCE pos_receipt_seq START 1;

CREATE TABLE public.pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no bigint NOT NULL UNIQUE DEFAULT nextval('pos_receipt_seq'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  cashier_id uuid NOT NULL REFERENCES public.pos_cashiers(id),
  shift_id uuid REFERENCES public.pos_shifts(id),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('parked','completed','reversed','reversal')),
  total_ore integer NOT NULL DEFAULT 0,
  vat_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method text NOT NULL CHECK (payment_method IN ('kort','kontant','swish','delad','parked')),
  payment_details jsonb,
  control_code text,
  reversed_transaction_id uuid REFERENCES public.pos_transactions(id),
  parked boolean NOT NULL DEFAULT false,
  parked_label text
);
CREATE INDEX idx_pos_tx_shift ON public.pos_transactions(shift_id);
CREATE INDEX idx_pos_tx_parked ON public.pos_transactions(cashier_id) WHERE parked;

CREATE TABLE public.pos_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.pos_transactions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.pos_products(id),
  product_name text NOT NULL,
  sku text,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  unit_price_ore integer NOT NULL,
  line_total_ore integer NOT NULL,
  discount_ore integer NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL
);
CREATE INDEX idx_pos_items_tx ON public.pos_transaction_items(transaction_id);

CREATE TABLE public.pos_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_pos_sync_pending ON public.pos_sync_queue(created_at) WHERE status = 'pending';

CREATE TABLE public.pos_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_cashier_id uuid REFERENCES public.pos_cashiers(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_audit_time ON public.pos_audit_log(occurred_at DESC);

ALTER TABLE public.pos_cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.pos_cashiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_transaction_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_sync_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER pos_products_updated_at
BEFORE UPDATE ON public.pos_products
FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();

INSERT INTO public.pos_products (sku, name, category, vat_rate, unit_type, price_ore, sort_order) VALUES
  ('FF-001','Lax, hel',           'Färsk fisk',     12, 'kg',     24900, 10),
  ('FF-002','Laxfilé',             'Färsk fisk',     12, 'kg',     32900, 20),
  ('FF-003','Torsk, filé',         'Färsk fisk',     12, 'kg',     27900, 30),
  ('FF-004','Kolja, filé',         'Färsk fisk',     12, 'kg',     21900, 40),
  ('FF-005','Hälleflundra',        'Färsk fisk',     12, 'kg',     49900, 50),
  ('FF-006','Röding',              'Färsk fisk',     12, 'kg',     31900, 60),
  ('SK-001','Räkor, handskalade',  'Skaldjur',       12, 'kg',     59900, 10),
  ('SK-002','Räkor, oskalade',     'Skaldjur',       12, 'kg',     34900, 20),
  ('SK-003','Krabba, hel kokt',    'Skaldjur',       12, 'kg',     27900, 30),
  ('SK-004','Hummer, levande',     'Skaldjur',       12, 'kg',     89900, 40),
  ('SK-005','Blåmusslor',          'Skaldjur',       12, 'kg',      8900, 50),
  ('RG-001','Gravad lax',          'Rökt & gravat',  12, 'kg',     39900, 10),
  ('RG-002','Rökt lax',            'Rökt & gravat',  12, 'kg',     42900, 20),
  ('RG-003','Rökt makrill',        'Rökt & gravat',  12, 'kg',     19900, 30),
  ('RG-004','Rökt sik',            'Rökt & gravat',  12, 'kg',     34900, 40),
  ('DK-001','Skagenröra, 250 g',   'Delikatess',     12, 'piece',   6900, 10),
  ('DK-002','Sillsallad, 250 g',   'Delikatess',     12, 'piece',   5900, 20),
  ('DK-003','Kaviar, tub 100 g',   'Delikatess',     12, 'piece',   4900, 30),
  ('TV-001','Fiskbuljong, 1 L',    'Torrvaror',      12, 'piece',   3900, 10),
  ('TV-002','Citron, st',          'Torrvaror',      12, 'piece',    900, 20);

INSERT INTO public.pos_cashiers (display_name, pin_hash, role) VALUES
  ('Demo Manager', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'manager'),
  ('Demo Kassör',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'cashier');