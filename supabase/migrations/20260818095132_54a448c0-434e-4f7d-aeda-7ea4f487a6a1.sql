CREATE OR REPLACE VIEW public.v_pk_clocked_in_now AS
 WITH today AS (
         SELECT (now() AT TIME ZONE 'Europe/Stockholm'::text)::date AS d
        ), wp AS (
         SELECT p.connection_id,
            p.url AS work_period_url,
            p.staff_url,
            p.staff_name,
            p.workplace_url,
            p.costgroup_url,
            p.costgroup_name,
            p.start,
            p."end",
            p.estimated_cost
           FROM pk_work_periods p,
            today t
          WHERE p.date = t.d AND p.is_published AND NOT p.is_deleted
        ), lt AS (
         SELECT l.*
           FROM pk_logged_times l,
            today t
          WHERE NOT l.is_canceled
            AND l.start IS NOT NULL
            -- Dagens stämplingar, plus pågående nattpass som startade inom ett dygn.
            AND ((l.start AT TIME ZONE 'Europe/Stockholm'::text)::date = t.d
                 OR (l.stop IS NULL AND l.start > now() - interval '24 hours'))
        ), joined AS (
         SELECT COALESCE(wp.connection_id, lt.connection_id) AS connection_id,
            COALESCE(wp.workplace_url, lt.workplace_url) AS workplace_url,
            COALESCE(lt.costgroup_url, wp.costgroup_url) AS costgroup_url,
            COALESCE(lt.costgroup_name, wp.costgroup_name) AS costgroup_name,
            COALESCE(wp.staff_url, lt.staff_url) AS staff_url,
            wp.work_period_url,
            lt.url AS logged_time_url,
            wp.start AS scheduled_start,
            wp."end" AS scheduled_end,
            wp.estimated_cost,
            lt.real_start,
            lt.real_stop,
            lt.stop,
            lt.start AS logged_start,
            lt.is_guest,
            lt.guest_name,
            wp.staff_name
           FROM wp
             FULL JOIN lt ON lt.connection_id = wp.connection_id AND (lt.work_period_url = wp.work_period_url OR lt.work_period_url IS NULL AND lt.staff_url = wp.staff_url AND lt.workplace_url = wp.workplace_url)
        )
 SELECT j.connection_id,
    COALESCE(cg.store_id, w.store_id) AS store_id,
    s.name AS store_name,
    j.workplace_url,
    w.name AS workplace_name,
    j.costgroup_url,
    j.costgroup_name,
    j.staff_url,
        CASE
            WHEN j.is_guest THEN COALESCE(j.guest_name, 'Gäst'::text)
            ELSE COALESCE(NULLIF(TRIM(BOTH FROM concat(ps.first_name, ' ', ps.last_name)), ''::text), j.staff_name, 'Okänd'::text)
        END AS display_name,
    j.is_guest,
    j.scheduled_start,
    j.scheduled_end,
    j.estimated_cost,
    COALESCE(j.real_start, j.logged_start) AS clocked_in_at,
    COALESCE(j.real_stop, j.stop) AS clocked_out_at,
        CASE
            WHEN j.logged_time_url IS NOT NULL AND j.stop IS NULL THEN 'pa_plats'::text
            WHEN j.logged_time_url IS NOT NULL AND j.stop IS NOT NULL THEN 'avslutad'::text
            WHEN j.work_period_url IS NULL THEN 'oplanerad'::text
            WHEN j.scheduled_start IS NOT NULL AND j.scheduled_start < (now() - '00:10:00'::interval) THEN 'ej_instamplad'::text
            ELSE 'kommer'::text
        END AS status,
        CASE
            WHEN j.stop IS NULL AND j.logged_time_url IS NOT NULL THEN EXTRACT(epoch FROM now() - COALESCE(j.real_start, j.logged_start))::integer
            ELSE NULL::integer
        END AS ongoing_seconds
   FROM joined j
     LEFT JOIN pk_costgroups cg ON cg.connection_id = j.connection_id AND cg.url = j.costgroup_url
     LEFT JOIN pk_workplaces w ON w.connection_id = j.connection_id AND w.url = j.workplace_url
     LEFT JOIN stores s ON s.id = COALESCE(cg.store_id, w.store_id)
     LEFT JOIN pk_staff ps ON ps.connection_id = j.connection_id AND ps.url = j.staff_url
  ORDER BY s.name, j.costgroup_name, j.scheduled_start;

GRANT SELECT ON public.v_pk_clocked_in_now TO authenticated;
GRANT ALL ON public.v_pk_clocked_in_now TO service_role;