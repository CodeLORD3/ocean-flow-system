
-- User roles table (per security guidelines, separate from profiles)
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles: users can read their own roles
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage all roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trade offers table
CREATE TABLE public.trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  target_amount numeric NOT NULL DEFAULT 0,
  funded_amount numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  maturity_date date NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  visibility text NOT NULL DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read open offers
CREATE POLICY "Authenticated can read offers" ON public.trade_offers
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert/update/delete offers
CREATE POLICY "Admins can manage offers" ON public.trade_offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also allow public read for the ERP side (no auth currently)
CREATE POLICY "Public read offers" ON public.trade_offers
  FOR SELECT TO anon
  USING (true);

-- Pledges table
CREATE TABLE public.pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.trade_offers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;

-- Users can read their own pledges
CREATE POLICY "Users can read own pledges" ON public.pledges
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own pledges
CREATE POLICY "Users can create pledges" ON public.pledges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all pledges
CREATE POLICY "Admins can read all pledges" ON public.pledges
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage all pledges
CREATE POLICY "Admins can manage pledges" ON public.pledges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Public read for ERP admin side
CREATE POLICY "Public read pledges" ON public.pledges
  FOR SELECT TO anon
  USING (true);
