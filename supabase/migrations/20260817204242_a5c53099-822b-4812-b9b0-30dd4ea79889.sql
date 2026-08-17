CREATE TABLE public.mail_intake_senders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern text NOT NULL,
  kind text NOT NULL DEFAULT 'email',
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  legal_entity_id text,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mail_intake_senders_pattern_key ON public.mail_intake_senders (lower(pattern));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_intake_senders TO authenticated;
GRANT ALL ON public.mail_intake_senders TO service_role;
ALTER TABLE public.mail_intake_senders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage mail senders" ON public.mail_intake_senders FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TABLE public.mail_intake_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id text NOT NULL,
  from_email text,
  from_name text,
  subject text,
  sent_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  folder text,
  status text NOT NULL DEFAULT 'ny',
  attachment_count integer NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mail_intake_messages_message_id_key ON public.mail_intake_messages (message_id);
CREATE INDEX mail_intake_messages_status_idx ON public.mail_intake_messages (status, received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_intake_messages TO authenticated;
GRANT ALL ON public.mail_intake_messages TO service_role;
ALTER TABLE public.mail_intake_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage mail messages" ON public.mail_intake_messages FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TABLE public.supplier_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid REFERENCES public.mail_intake_messages(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text,
  file_hash text,
  mime_type text,
  doc_type text NOT NULL DEFAULT 'okand',
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  legal_entity_id text,
  document_number text,
  document_date date,
  delivery_date date,
  total_ex_vat numeric,
  currency text,
  parsed jsonb,
  parse_status text NOT NULL DEFAULT 'vantar',
  parse_error text,
  status text NOT NULL DEFAULT 'utkast',
  reject_reason text,
  duplicate_of uuid REFERENCES public.supplier_documents(id) ON DELETE SET NULL,
  purchase_report_id uuid REFERENCES public.purchase_reports(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_documents_file_hash_key ON public.supplier_documents (file_hash) WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX supplier_documents_number_key ON public.supplier_documents (supplier_id, doc_type, lower(document_number)) WHERE supplier_id IS NOT NULL AND document_number IS NOT NULL;
CREATE INDEX supplier_documents_status_idx ON public.supplier_documents (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_documents TO authenticated;
GRANT ALL ON public.supplier_documents TO service_role;
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage supplier documents" ON public.supplier_documents FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TABLE public.mail_intake_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  folder text,
  fetched integer NOT NULL DEFAULT 0,
  stored integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  unread_without_attachment integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_intake_runs_started_idx ON public.mail_intake_runs (started_at DESC);
GRANT SELECT ON public.mail_intake_runs TO authenticated;
GRANT ALL ON public.mail_intake_runs TO service_role;
ALTER TABLE public.mail_intake_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read mail runs" ON public.mail_intake_runs FOR SELECT TO authenticated USING (public.is_staff());

CREATE TRIGGER mail_intake_senders_updated_at BEFORE UPDATE ON public.mail_intake_senders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER mail_intake_messages_updated_at BEFORE UPDATE ON public.mail_intake_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER supplier_documents_updated_at BEFORE UPDATE ON public.supplier_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();