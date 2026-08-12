DROP VIEW public.staff_access;
CREATE VIEW public.staff_access AS
SELECT s.id,
    s.first_name,
    s.last_name,
    s.age,
    s.phone,
    s.email,
    s.workplace,
    s.profile_image_url,
    s.store_id,
    s.created_at,
    s.user_id,
    s.must_change_password,
    s.legal_entity_id,
    s.hourly_rate,
    user_portals(s.user_id) AS portal_access,
    user_store_ids(s.user_id) AS allowed_store_ids,
    st.name AS store_name
   FROM public.staff s
     LEFT JOIN public.stores st ON st.id = s.store_id;

GRANT SELECT ON public.staff_access TO authenticated;
GRANT ALL ON public.staff_access TO service_role;