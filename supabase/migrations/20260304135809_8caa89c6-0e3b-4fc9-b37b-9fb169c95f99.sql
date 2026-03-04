
-- Stores (butiker) for reference
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  hours TEXT,
  manager TEXT,
  sqm INTEGER DEFAULT 0,
  is_wholesale BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Suppliers (leverantörer)
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  country TEXT DEFAULT 'Sverige',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Product catalog with pricing
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  retail_suggested NUMERIC(10,2) DEFAULT 0,
  stock NUMERIC(10,2) NOT NULL DEFAULT 0,
  origin TEXT,
  supplier_id UUID REFERENCES public.suppliers(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Price history for tracking changes
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  cost_price NUMERIC(10,2),
  wholesale_price NUMERIC(10,2),
  retail_suggested NUMERIC(10,2),
  changed_by TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Incoming deliveries (inleveranser from suppliers to grossist)
CREATE TABLE public.incoming_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id),
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Mottagen',
  notes TEXT,
  received_by TEXT,
  total_weight NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.incoming_delivery_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.incoming_deliveries(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  batch_number TEXT,
  best_before DATE,
  notes TEXT
);

-- Delivery notes (följesedlar from grossist to butiker)
CREATE TABLE public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_number TEXT NOT NULL UNIQUE,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Utkast',
  notes TEXT,
  created_by TEXT,
  total_weight NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.delivery_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID REFERENCES public.delivery_notes(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  wholesale_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) GENERATED ALWAYS AS (quantity * wholesale_price) STORED
);

-- Production batches
CREATE TABLE public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL,
  unit TEXT DEFAULT 'kg',
  planned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'Planerad',
  operator TEXT,
  waste_kg NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow public access for now (no auth yet)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_delivery_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (will be tightened when auth is added)
CREATE POLICY "Public access" ON public.stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.incoming_deliveries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.incoming_delivery_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.delivery_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.delivery_note_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.production_batches FOR ALL USING (true) WITH CHECK (true);
