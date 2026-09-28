-- 1) Vyer: ta bort anon-åtkomst (vyer kör som ägare och kringgår RLS)
REVOKE SELECT ON public.lot_remaining, public.staff_access, public.v_pk_clocked_in_now, public.pos_price_overview,
  public.actor_names, public.retail_customer_duplicates, public.pk_logged_times_effective, public.weekly_region_reports FROM anon;

-- Vyer där underliggande RLS räcker: kör som anroparen
ALTER VIEW public.lot_remaining SET (security_invoker = true);
ALTER VIEW public.v_pk_clocked_in_now SET (security_invoker = true);
ALTER VIEW public.pos_price_overview SET (security_invoker = true);
ALTER VIEW public.retail_customer_duplicates SET (security_invoker = true);
ALTER VIEW public.pk_logged_times_effective SET (security_invoker = true);
ALTER VIEW public.weekly_region_reports SET (security_invoker = true);

-- staff_access / actor_names behåller ägarrättighet (behöver roll-hjälpfunktioner) men begränsas till personal
CREATE OR REPLACE VIEW public.staff_access AS
 SELECT s.id, s.first_name, s.last_name, s.age, s.phone, s.email, s.workplace, s.profile_image_url, s.store_id,
    s.created_at, s.user_id, s.must_change_password, s.legal_entity_id, s.hourly_rate,
    user_portals(s.user_id) AS portal_access,
    user_store_ids(s.user_id) AS allowed_store_ids,
    ARRAY( SELECT user_company_ids(s.user_id) AS user_company_ids) AS allowed_company_ids,
    ARRAY( SELECT user_region_tags(s.user_id) AS user_region_tags) AS allowed_region_tags,
    (ARRAY( SELECT user_tenant_ids(s.user_id) AS user_tenant_ids))::text[] AS allowed_tenant_ids,
    user_primary_role(s.user_id) AS primary_role,
    is_platform_admin(s.user_id) AS is_platform_admin,
    st.name AS store_name
   FROM staff s LEFT JOIN stores st ON st.id = s.store_id
  WHERE s.user_id = auth.uid() OR (public.is_staff() AND public.can_see_company(s.legal_entity_id));

CREATE OR REPLACE VIEW public.actor_names AS
 SELECT user_id,
    NULLIF(TRIM(BOTH FROM ((COALESCE(first_name, '') || ' ') || COALESCE(last_name, ''))), '') AS display_name
   FROM staff s
  WHERE user_id IS NOT NULL AND (public.is_staff() OR user_id = auth.uid());
REVOKE SELECT ON public.staff_access, public.actor_names FROM anon;

-- 2) Alltför öppna policies: "alla inloggade" (inkl. investerare) -> endast personal
ALTER POLICY "Staff can add image activity" ON public.image_activity WITH CHECK (public.is_staff());
ALTER POLICY "Staff can read image activity" ON public.image_activity USING (public.is_staff());
ALTER POLICY "Staff can update image links" ON public.image_links USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY "Staff can read image links" ON public.image_links USING (public.is_staff());
ALTER POLICY "Staff can delete image links" ON public.image_links USING (public.is_staff());
ALTER POLICY "Staff can create image links" ON public.image_links WITH CHECK (public.is_staff());
ALTER POLICY "Staff can read observations" ON public.image_observations USING (public.is_staff());
ALTER POLICY "Staff can delete observations" ON public.image_observations USING (public.is_staff());
ALTER POLICY "Staff can update observations" ON public.image_observations USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY "Staff can create observations" ON public.image_observations WITH CHECK (public.is_staff());
ALTER POLICY image_views_read ON public.image_views USING (public.is_staff());
ALTER POLICY improvement_suggestions_insert ON public.improvement_suggestions WITH CHECK (public.is_staff());
ALTER POLICY improvement_suggestions_read ON public.improvement_suggestions USING (public.is_staff());
ALTER POLICY map_object_types_read ON public.map_object_types USING (public.is_staff());
ALTER POLICY map_zone_connections_read ON public.map_zone_connections USING (public.is_staff());
ALTER POLICY price_tiers_read ON public.price_tiers USING (public.is_staff());
ALTER POLICY resource_items_read ON public.resource_items USING (public.is_staff());
ALTER POLICY resource_locations_read ON public.resource_locations USING (public.is_staff());
ALTER POLICY resource_shortage_reports_update ON public.resource_shortage_reports USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY resource_shortage_reports_insert ON public.resource_shortage_reports WITH CHECK (public.is_staff());
ALTER POLICY resource_shortage_reports_read ON public.resource_shortage_reports USING (public.is_staff());
ALTER POLICY store_resource_mappings_read ON public.store_resource_mappings USING (public.is_staff());
ALTER POLICY store_targets_authenticated ON public.store_targets USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY system_checks_authenticated ON public.system_checks USING (public.is_staff());
ALTER POLICY task_categories_read ON public.task_categories USING (public.is_staff());
ALTER POLICY task_checkpoint_results_all ON public.task_checkpoint_results USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY task_checkpoints_read ON public.task_checkpoints USING (public.is_staff());
ALTER POLICY task_pauses_all ON public.task_pauses USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY task_prep_checks_read ON public.task_prep_checks USING (public.is_staff());
ALTER POLICY task_prep_checks_write ON public.task_prep_checks USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY task_resource_requirements_read ON public.task_resource_requirements USING (public.is_staff());
ALTER POLICY task_route_snapshots_read ON public.task_route_snapshots USING (public.is_staff());
ALTER POLICY task_route_snapshots_insert ON public.task_route_snapshots WITH CHECK (public.is_staff());
ALTER POLICY task_standard_routes_read ON public.task_standard_routes USING (public.is_staff());

-- 3) Fast search_path
ALTER FUNCTION public.set_uppdaterad() SET search_path = public;

-- 4) Interna SECURITY DEFINER-funktioner (triggers, cron, interna hjälpare utan anrop från appen)
REVOKE EXECUTE ON FUNCTION
  public.block_locked_stock_count(), public.block_self_attestation(), public.enforce_stock_report_line_allowed(),
  public.log_shift_change(), public.time_entries_sync_staff_shift(), public.stock_write_allowed(),
  public.check_station_heartbeats(integer),
  public.absence_generate_days(uuid), public.absence_policy_for(text), public.comp_adjust(uuid, integer, text),
  public.company_of_location(uuid, date), public.company_of_store(uuid, date), public.compute_vacation_balance(uuid, integer),
  public.cost_read_allowed(uuid), public.entity_series_code(text), public.get_employee_pnr(uuid),
  public.has_company_scoping(uuid), public.has_scope(uuid, text, text), public.is_store_scoped(uuid),
  public.pos_vat_rate_for(character, text, date), public.preliminar_manadskostnad(uuid, date),
  public.preliminar_passkostnad(uuid, date, integer), public.pricing_calc(uuid, uuid),
  public.pricing_pick_rule(text, uuid, text, uuid), public.refresh_weekly_corrected_flag(uuid, date),
  public.sick_karens_count_12m(uuid), public.staff_shifts_rebuild_from_clock(uuid, date),
  public.staff_shifts_rebuild_range(date, date), public.vacation_adjust(uuid, integer, numeric, text),
  public.wholesale_price_for(uuid, uuid)
FROM PUBLIC, anon, authenticated;