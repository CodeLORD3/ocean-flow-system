
-- Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'Sweden',
  industry text,
  description text,
  contact_person text,
  contact_email text,
  logo_url text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Public access for dev
CREATE POLICY "Public access" ON public.companies FOR ALL TO public USING (true) WITH CHECK (true);

-- Add company_id to trade_offers
ALTER TABLE public.trade_offers ADD COLUMN company_id uuid REFERENCES public.companies(id);
