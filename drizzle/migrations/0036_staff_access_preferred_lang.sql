CREATE OR REPLACE VIEW public.staff_access WITH (security_invoker=true) AS
 SELECT s.id, s.first_name, s.last_name, s.age, s.phone, s.email, s.workplace, s.profile_image_url, s.store_id, s.created_at, s.user_id, s.must_change_password, s.legal_entity_id, s.hourly_rate,
    user_portals(s.user_id) AS portal_access,
    user_store_ids(s.user_id) AS allowed_store_ids,
    ARRAY( SELECT user_company_ids(s.user_id) AS user_company_ids) AS allowed_company_ids,
    ARRAY( SELECT user_region_tags(s.user_id) AS user_region_tags) AS allowed_region_tags,
    (ARRAY( SELECT user_tenant_ids(s.user_id) AS user_tenant_ids))::text[] AS allowed_tenant_ids,
    user_primary_role(s.user_id) AS primary_role,
    is_platform_admin(s.user_id) AS is_platform_admin,
    st.name AS store_name,
    s.preferred_lang
   FROM staff s
     LEFT JOIN stores st ON st.id = s.store_id
  WHERE s.user_id = auth.uid() OR (is_staff() AND can_see_company(s.legal_entity_id));