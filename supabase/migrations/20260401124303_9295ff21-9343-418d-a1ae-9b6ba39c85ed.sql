
-- Add verification_status column to investor_profiles
ALTER TABLE public.investor_profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'action_required';

-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: investors can upload their own KYC docs
CREATE POLICY "Users can upload own kyc docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: investors can view their own KYC docs
CREATE POLICY "Users can view own kyc docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: admins can view all KYC docs
CREATE POLICY "Admins can manage kyc docs"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'kyc-documents' AND public.has_role(auth.uid(), 'admin'));
