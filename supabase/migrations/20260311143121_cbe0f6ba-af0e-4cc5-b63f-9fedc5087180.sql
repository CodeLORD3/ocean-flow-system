
-- Create staff table
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  age integer,
  phone text,
  email text,
  workplace text,
  profile_image_url text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Public access policy (consistent with other tables)
CREATE POLICY "Public access" ON public.staff FOR ALL TO public USING (true) WITH CHECK (true);

-- Create storage bucket for staff profile images
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-photos', 'staff-photos', true);

-- Storage RLS policies
CREATE POLICY "Public read staff photos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'staff-photos');
CREATE POLICY "Public upload staff photos" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'staff-photos');
CREATE POLICY "Public update staff photos" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'staff-photos');
CREATE POLICY "Public delete staff photos" ON storage.objects FOR DELETE TO public USING (bucket_id = 'staff-photos');
