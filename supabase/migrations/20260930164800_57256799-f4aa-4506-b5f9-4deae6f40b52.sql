ALTER TABLE public.work_sites ADD COLUMN IF NOT EXISTS mobile_self_punch_staff_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.work_sites SET mobile_self_punch_staff_ids = ARRAY['ad829a0e-66b9-4027-aacc-23249acf7390','ff4aaab1-ad66-4118-872f-6bff55a4e351','8d39aaa7-82b5-402a-afe3-d7f200abe282']::uuid[]
WHERE id = 'd7b7b0bd-6c6c-4432-a414-46f3f2948a8d';