update public.floor_plans set px_per_meter = 42.5, updated_at = now() where id = 'f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":412,"y":230},{"x":762,"y":233},{"x":758,"y":371},{"x":410,"y":366}]'::jsonb,
  x=410, y=230, width=352, height=141, area_sqm=26.5, updated_at=now()
where zone_key='lager' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":393,"y":521},{"x":389,"y":651},{"x":258,"y":651},{"x":261,"y":528}]'::jsonb,
  x=258, y=521, width=135, height=130, area_sqm=8.5, updated_at=now()
where zone_key='wc' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":258,"y":656},{"x":475,"y":675},{"x":471,"y":849},{"x":252,"y":849}]'::jsonb,
  x=252, y=656, width=223, height=193, area_sqm=20.0, updated_at=now()
where zone_key='beredning' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":252,"y":854},{"x":559,"y":860},{"x":569,"y":911},{"x":722,"y":929},{"x":721,"y":1089},{"x":231,"y":1032}]'::jsonb,
  x=231, y=854, width=491, height=235, area_sqm=45.0, updated_at=now()
where zone_key='kundyta' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":256,"y":858},{"x":556,"y":864},{"x":554,"y":952},{"x":254,"y":946}]'::jsonb,
  x=254, y=858, width=302, height=94, area_sqm=7.0, updated_at=now()
where zone_key='fiskdisk' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';

update public.map_zones set points = '[{"x":400,"y":995},{"x":520,"y":1008},{"x":518,"y":1050},{"x":398,"y":1037}]'::jsonb,
  x=398, y=995, width=122, height=55, area_sqm=2.5, updated_at=now()
where zone_key='entre' and floor_plan_id='f556c1d8-daa9-43d0-a19f-83a445e13cee';