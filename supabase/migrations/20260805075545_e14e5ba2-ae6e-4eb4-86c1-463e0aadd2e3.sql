CREATE TABLE public.checklist_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  day_id uuid REFERENCES public.checklist_days(id) ON DELETE CASCADE,
  store_id uuid,
  requested_signature text NOT NULL,
  target_staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  requested_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  requested_by_name text,
  previous_signature text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE INDEX idx_csr_item ON public.checklist_signature_requests(item_id);
CREATE INDEX idx_csr_target_pending ON public.checklist_signature_requests(target_staff_id, status);
CREATE UNIQUE INDEX idx_csr_one_pending_per_item ON public.checklist_signature_requests(item_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_signature_requests TO authenticated;
GRANT ALL ON public.checklist_signature_requests TO service_role;

ALTER TABLE public.checklist_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage signature requests"
ON public.checklist_signature_requests FOR ALL TO authenticated
USING (true) WITH CHECK (true);