-- Momssats per kategori: bolagets egen rad, sedan gemensam kategorirad
-- (t.ex. Emballage 25 %), sedan bolagets standard, sist gemensam standard.
CREATE OR REPLACE FUNCTION public.fortnox_vat_rate(p_entity text, p_category text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select v.rate from public.vat_rates v
      where v.legal_entity_id = p_entity
        and lower(btrim(v.category)) = lower(btrim(coalesce(p_category,'')))
        and coalesce(p_category,'') <> '' limit 1),
    (select v.rate from public.vat_rates v
      where v.legal_entity_id is null
        and lower(btrim(v.category)) = lower(btrim(coalesce(p_category,'')))
        and coalesce(p_category,'') <> '' limit 1),
    (select v.rate from public.vat_rates v
      where v.legal_entity_id = p_entity and v.category = '*' limit 1),
    (select v.rate from public.vat_rates v
      where v.legal_entity_id is null and v.category = '*' limit 1),
    6
  );
$function$;

INSERT INTO public.vat_rates (legal_entity_id, category, rate)
SELECT NULL, 'Städ & Hushåll', 25
WHERE NOT EXISTS (SELECT 1 FROM public.vat_rates WHERE legal_entity_id IS NULL AND category = 'Städ & Hushåll');
