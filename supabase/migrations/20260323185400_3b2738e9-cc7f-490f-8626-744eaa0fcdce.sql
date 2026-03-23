
CREATE TABLE public.investor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  telephone text NOT NULL,
  email text NOT NULL,
  account_type text NOT NULL DEFAULT 'private',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.investor_profiles ENABLE ROW LEVEL SECURITY;

-- Investors can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.investor_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Investors can read their own profile
CREATE POLICY "Users can read own profile"
ON public.investor_profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins can do everything
CREATE POLICY "Admins can manage profiles"
ON public.investor_profiles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
