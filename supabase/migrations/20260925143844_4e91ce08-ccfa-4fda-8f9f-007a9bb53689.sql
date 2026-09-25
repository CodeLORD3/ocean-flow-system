CREATE TABLE IF NOT EXISTS public.employment_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text,
  name text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_contract_templates TO authenticated;
GRANT ALL ON public.employment_contract_templates TO service_role;
ALTER TABLE public.employment_contract_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Personal läser avtalsmallar" ON public.employment_contract_templates;
CREATE POLICY "Personal läser avtalsmallar" ON public.employment_contract_templates FOR SELECT TO authenticated
  USING (public.is_staff_manager() OR public.has_role(auth.uid(),'store_manager'));
DROP POLICY IF EXISTS "Personaladmin hanterar avtalsmallar" ON public.employment_contract_templates;
CREATE POLICY "Personaladmin hanterar avtalsmallar" ON public.employment_contract_templates FOR ALL TO authenticated
  USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employment_id uuid REFERENCES public.employments(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.employment_contract_templates(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Anställningsavtal',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','skickat','delvis_signerat','signerat','avbrutet')),
  scrive_document_id text,
  signatories jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_path text,
  signed_pdf_path text,
  error text,
  created_by uuid DEFAULT auth.uid(),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employment_contracts_employee_idx ON public.employment_contracts(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_contracts TO authenticated;
GRANT ALL ON public.employment_contracts TO service_role;
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Avtal läses av den anställde och chefer" ON public.employment_contracts;
CREATE POLICY "Avtal läses av den anställde och chefer" ON public.employment_contracts FOR SELECT TO authenticated
  USING (public.can_see_employee(employee_id));
DROP POLICY IF EXISTS "Chefer hanterar avtal" ON public.employment_contracts;
CREATE POLICY "Chefer hanterar avtal" ON public.employment_contracts FOR ALL TO authenticated
  USING (public.is_staff_manager() OR (public.has_role(auth.uid(),'store_manager') AND public.can_see_employee(employee_id)))
  WITH CHECK (public.is_staff_manager() OR (public.has_role(auth.uid(),'store_manager') AND public.can_see_employee(employee_id)));

CREATE OR REPLACE FUNCTION public.employment_contracts_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') = 'service_role' OR current_user IN ('postgres','service_role','supabase_admin') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'utkast' THEN RAISE EXCEPTION 'Ett skickat avtal kan inte tas bort.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'utkast' THEN
    RAISE EXCEPTION 'Ett skickat avtal kan inte ändras. Skapa ett nytt avtal i stället.';
  END IF;
  IF NEW.status <> 'utkast' THEN
    RAISE EXCEPTION 'Avtalet skickas via knappen Skicka för underskrift.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_employment_contracts_guard ON public.employment_contracts;
CREATE TRIGGER trg_employment_contracts_guard BEFORE UPDATE OR DELETE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_guard();

-- Underskriftsdata för tjänsten (endast service role)
CREATE OR REPLACE FUNCTION public.contract_signer_data(_contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c record; emp record; mgr record; mgr_emp record; st uuid; res jsonb;
  FUNCTION_pnr text;
BEGIN
  SELECT * INTO c FROM employment_contracts WHERE id = _contract_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Avtalet finns inte'; END IF;
  SELECT * INTO emp FROM employees WHERE id = c.employee_id;
  SELECT store_id INTO st FROM employments WHERE id = c.employment_id;
  IF st IS NULL THEN
    SELECT store_id INTO st FROM employments WHERE employee_id = c.employee_id AND is_active ORDER BY start_date DESC NULLS LAST LIMIT 1;
  END IF;
  SELECT s.* INTO mgr FROM staff_access s
   WHERE s.primary_role IN ('store_manager','multi_store_manager')
     AND (s.store_id = st OR st = ANY(coalesce(s.allowed_store_ids,'{}'::uuid[])))
     AND s.id IS DISTINCT FROM emp.staff_id
   ORDER BY (s.store_id = st) DESC NULLS LAST, s.primary_role LIMIT 1;
  IF mgr IS NOT NULL THEN
    SELECT * INTO mgr_emp FROM employees WHERE staff_id = mgr.id LIMIT 1;
  END IF;
  res := jsonb_build_object(
    'employee', jsonb_build_object(
      'name', trim(emp.first_name||' '||emp.last_name), 'email', emp.email,
      'pnr', CASE WHEN emp.pnr_encrypted IS NULL THEN NULL ELSE pgp_sym_decrypt(emp.pnr_encrypted, employee_pnr_key_for_year(coalesce(emp.pnr_encryption_year, beskattningsar(now())))) END),
    'manager', CASE WHEN mgr IS NULL THEN NULL ELSE jsonb_build_object(
      'name', trim(coalesce(mgr_emp.first_name, mgr.first_name)||' '||coalesce(mgr_emp.last_name, mgr.last_name)),
      'email', coalesce(mgr_emp.email, mgr.email),
      'pnr', CASE WHEN mgr_emp.pnr_encrypted IS NULL THEN NULL ELSE pgp_sym_decrypt(mgr_emp.pnr_encrypted, employee_pnr_key_for_year(coalesce(mgr_emp.pnr_encryption_year, beskattningsar(now())))) END) END
  );
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.contract_signer_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_signer_data(uuid) TO service_role;

INSERT INTO public.employment_contract_templates (id, legal_entity_id, name, sections)
VALUES ('00000000-0000-4000-a000-00000000c0a1', NULL, 'Anställningsavtal enligt Handelsavtalet', $j$[
 {"id":"parter","title":"Parter","body":"Arbetsgivare: {{bolag}}, organisationsnummer {{orgnr}}.\nArbetstagare: {{namn}}, personnummer {{personnummer}}, {{adress}}."},
 {"id":"anstallning","title":"Anställning","body":"Arbetstagaren anställs som {{befattning}} med placering i {{butik}}.\nAnställningsform: {{anstallningsform}}.\nAnställningen börjar {{startdatum}}{{slutdatum_text}}.{{provanstallning_text}}"},
 {"id":"arbetstid","title":"Arbetstid","body":"Sysselsättningsgraden är {{sysselsattning}} procent av heltid. Arbetstiden förläggs enligt schema som fastställs av arbetsgivaren i enlighet med kollektivavtalet."},
 {"id":"lon","title":"Lön","body":"Lönen är {{lon}}. Lönen betalas ut månadsvis den 25:e. Ersättning för obekväm arbetstid betalas enligt kollektivavtalet{{ob_text}}."},
 {"id":"semester","title":"Semester","body":"Semester utgår enligt semesterlagen och kollektivavtalet med {{semesterdagar}} dagar per år."},
 {"id":"kollektivavtal","title":"Kollektivavtal","body":"För anställningen gäller {{avtalsomrade}} i dess vid varje tid gällande lydelse."},
 {"id":"uppsagning","title":"Uppsägning","body":"Uppsägningstid gäller enligt lagen om anställningsskydd och kollektivavtalet."},
 {"id":"ovrigt","title":"Övrigt","body":"Arbetstagaren är skyldig att följa arbetsgivarens rutiner för livsmedelshygien, egenkontroll och arbetsmiljö. Tystnadsplikt gäller för uppgifter om verksamheten, kunder och kollegor."}
]$j$::jsonb)
ON CONFLICT (id) DO NOTHING;