ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS org_number text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS address2 text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'SE',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'SEK',
  ADD COLUMN IF NOT EXISTS vat_type text,
  ADD COLUMN IF NOT EXISTS terms_of_payment text,
  ADD COLUMN IF NOT EXISTS delivery_name text,
  ADD COLUMN IF NOT EXISTS delivery_address1 text,
  ADD COLUMN IF NOT EXISTS delivery_zip_code text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_country_code text,
  ADD COLUMN IF NOT EXISTS legal_entity_code text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS customers_org_number_idx ON public.customers (org_number);

CREATE OR REPLACE FUNCTION public.fortnox_import_customer(p_entity text, p_customer_number text, p_makrilltrade_customer_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_id uuid := p_makrilltrade_customer_id;
begin
  if v_id is null then
    insert into public.customers (
      name, org_number, vat_number, email, phone, address, address2, zip_code, city,
      country_code, currency, vat_type, terms_of_payment,
      delivery_name, delivery_address1, delivery_zip_code, delivery_city, delivery_country_code,
      legal_entity_code, source, is_active)
    values (
      coalesce(nullif(p_payload->>'name',''), 'Fortnox ' || p_customer_number),
      p_payload->>'org_number', p_payload->>'vat_number', p_payload->>'email', p_payload->>'phone',
      p_payload->>'address1', p_payload->>'address2', p_payload->>'zip_code', p_payload->>'city',
      coalesce(p_payload->>'country_code','SE'), coalesce(p_payload->>'currency','SEK'),
      p_payload->>'vat_type', p_payload->>'terms_of_payment',
      p_payload->>'delivery_name', p_payload->>'delivery_address1', p_payload->>'delivery_zip_code',
      p_payload->>'delivery_city', p_payload->>'delivery_country_code',
      p_entity, 'fortnox', true)
    returning id into v_id;
  else
    update public.customers set
      name = coalesce(nullif(p_payload->>'name',''), name),
      org_number = coalesce(p_payload->>'org_number', org_number),
      vat_number = coalesce(p_payload->>'vat_number', vat_number),
      email = coalesce(p_payload->>'email', email),
      phone = coalesce(p_payload->>'phone', phone),
      address = coalesce(p_payload->>'address1', address),
      address2 = coalesce(p_payload->>'address2', address2),
      zip_code = coalesce(p_payload->>'zip_code', zip_code),
      city = coalesce(p_payload->>'city', city),
      country_code = coalesce(p_payload->>'country_code', country_code),
      currency = coalesce(p_payload->>'currency', currency),
      vat_type = coalesce(p_payload->>'vat_type', vat_type),
      terms_of_payment = coalesce(p_payload->>'terms_of_payment', terms_of_payment),
      delivery_name = coalesce(p_payload->>'delivery_name', delivery_name),
      delivery_address1 = coalesce(p_payload->>'delivery_address1', delivery_address1),
      delivery_zip_code = coalesce(p_payload->>'delivery_zip_code', delivery_zip_code),
      delivery_city = coalesce(p_payload->>'delivery_city', delivery_city),
      delivery_country_code = coalesce(p_payload->>'delivery_country_code', delivery_country_code)
    where id = v_id;
  end if;

  insert into public.fortnox_customer_map (legal_entity_code, makrilltrade_customer_id, fortnox_customer_number, match_method, confirmed)
  values (p_entity, v_id, p_customer_number, 'fortnox_import', true)
  on conflict (legal_entity_code, makrilltrade_customer_id) do update
    set fortnox_customer_number = excluded.fortnox_customer_number,
        match_method = 'fortnox_import',
        confirmed = true;

  return v_id;
end
$function$;

REVOKE ALL ON FUNCTION public.fortnox_import_customer(text,text,uuid,jsonb) FROM public, anon, authenticated;