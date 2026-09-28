revoke execute on function public.trg_fill_pos_from_recon() from public, anon, authenticated;
revoke execute on function public.trg_fill_pos_on_report() from public, anon, authenticated;
revoke execute on function public.dagsrapporter_saknas(date, date) from public, anon, authenticated;
grant execute on function public.dagsrapporter_saknas(date, date) to service_role;