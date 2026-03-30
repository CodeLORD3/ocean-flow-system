
-- Add country and iban columns to investor_profiles
ALTER TABLE public.investor_profiles 
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Sweden',
  ADD COLUMN IF NOT EXISTS iban text;

-- Make KYC-specific fields nullable for simpler signup
ALTER TABLE public.investor_profiles 
  ALTER COLUMN date_of_birth DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN telephone DROP NOT NULL;

-- Create trigger to auto-create investor profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_investor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.investor_profiles (user_id, first_name, last_name, email, country, status, date_of_birth, address, telephone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'country', 'Sweden'),
    'approved',
    NULL,
    NULL,
    NULL
  );
  RETURN NEW;
END;
$$;

-- Drop if exists to avoid conflict
DROP TRIGGER IF EXISTS on_auth_user_created_investor ON auth.users;

CREATE TRIGGER on_auth_user_created_investor
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_investor();
