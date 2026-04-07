
-- Add new fields to companies table
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS description_long text,
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS employee_count text,
  ADD COLUMN IF NOT EXISTS revenue_range text,
  ADD COLUMN IF NOT EXISTS website_url text;

-- Create company_documents table
CREATE TABLE public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  document_type text DEFAULT 'general',
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  uploaded_by uuid
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- Public read, admin write
CREATE POLICY "Public can read company_documents"
  ON public.company_documents FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can manage company_documents"
  ON public.company_documents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
