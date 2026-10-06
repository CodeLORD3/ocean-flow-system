REVOKE ALL ON public.telefonsamtal, public.telefon_nycklar, public.telefon_installningar, public.telefon_logg FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON public.telefonsamtal, public.telefon_installningar FROM authenticated;
REVOKE ALL ON public.telefon_nycklar, public.telefon_logg FROM authenticated;