REVOKE ALL ON TABLE public.fortnox_inbox_scan_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fortnox_inbox_scan_state TO service_role;